import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { resolve } from "node:path"
import type { AppServerHandoff, AppServerThread, AppServerThreadStatus } from "./types"
import { WebSocketRpcClient } from "./websocket-rpc"

type HandoffOptions = {
  readonly binary: string
  readonly env: NodeJS.ProcessEnv
  readonly timeoutMs: number
  readonly spawnProcess: typeof spawn
  readonly cwd: string
  readonly prompt: string
  readonly model?: string
  readonly threadId?: string
  readonly threadName?: string
  readonly goal?: {
    readonly objective: string
    readonly status: "active"
  }
}

type ThreadSyncRpc = {
  request(id: number, method: string, params: Readonly<Record<string, unknown>>): Promise<unknown>
}

export async function syncThreadToApp(
  rpc: ThreadSyncRpc,
  threadId: string,
  input: Pick<HandoffOptions, "prompt" | "threadName" | "goal">,
  requestIds: readonly [number, number] = [4, 5],
): Promise<{ readonly nameSynced: boolean; readonly goalSynced: boolean }> {
  const name = input.threadName ?? `lfg/handoff: ${shortFocus(input.prompt)}`
  const goal = input.goal ?? { objective: input.prompt, status: "active" as const }
  // senpi and older Codex builds may omit name/goal methods (-32601). Treat as soft optional.
  const nameSynced = await bestEffortRpc(rpc, requestIds[0], "thread/name/set", { threadId, name })
  const goalSynced = await bestEffortRpc(rpc, requestIds[1], "thread/goal/set", {
    threadId,
    objective: goal.objective,
    status: goal.status,
  })
  return { nameSynced, goalSynced }
}

async function bestEffortRpc(
  rpc: ThreadSyncRpc,
  id: number,
  method: string,
  params: Readonly<Record<string, unknown>>,
): Promise<boolean> {
  try {
    await rpc.request(id, method, params)
    return true
  } catch (error) {
    if (isMethodNotFound(error)) return false
    throw error
  }
}

function isMethodNotFound(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const msg = error.message
  return /Method not found|code[\"']?\s*[:=]\s*-32601|-32601/i.test(msg)
}

export async function handoffWithAppServer(options: HandoffOptions): Promise<AppServerHandoff> {
  const deadline = Date.now() + options.timeoutMs
  const currentOptions = (): HandoffOptions => ({ ...options, timeoutMs: Math.max(1, deadline - Date.now()) })
  const daemonReady = await startDaemon(currentOptions())
  if (daemonReady) {
    try {
      return await handoffWithProxy(currentOptions())
    } catch (error) {
      if (!(error instanceof Error)) throw error
      try {
        return await handoffWithProxy(currentOptions())
      } catch (retryError) {
        if (!(retryError instanceof Error)) throw retryError
      }
    }
  }
  try {
    return await handoffWithTransport(currentOptions(), ["app-server", "--stdio"])
  } catch (error) {
    return fallback(cleanError(error))
  }
}

async function handoffWithProxy(options: HandoffOptions): Promise<AppServerHandoff> {
  try {
    return await handoffWithProxyConnection(options, false)
  } catch (error) {
    if (!isThreadNotFound(error)) throw error
    return handoffWithProxyConnection(options, true)
  }
}

async function handoffWithProxyConnection(options: HandoffOptions, startFresh: boolean): Promise<AppServerHandoff> {
  const child = options.spawnProcess(options.binary, ["app-server", "proxy"], { env: options.env, cwd: options.cwd })
  const rpc = new WebSocketRpcClient(child, options.timeoutMs)
  try {
    await rpc.request(1, "initialize", { clientInfo: { name: "lfg-handoff", version: "1" }, capabilities: { experimentalApi: false } })
    await rpc.notify("initialized")
    const listed = await rpc.request(2, "thread/list", { cwd: options.cwd, limit: 200, sortKey: "updated_at", sortDirection: "desc" })
    const threads = parseThreadList(listed)
    if (startFresh) {
      const thread = await startProxyThread(rpc, options)
      return await startProxyTurn(rpc, thread, false, options)
    }
    const existing = selectThread(threads, options.cwd, options.threadId)
    if (existing === undefined) {
      const thread = await openProxyThread(rpc, options, threads)
      return await startProxyTurn(rpc, thread, false, options)
    }
    try {
      const thread = await resumeProxyThread(rpc, existing, options)
      return await startProxyTurn(rpc, thread, true, options)
    } catch (error) {
      if (!isThreadNotFound(error)) throw error
      const thread = await startProxyThread(rpc, options)
      return await startProxyTurn(rpc, thread, false, options)
    }
  } finally {
    rpc.close()
  }
}

async function startProxyTurn(
  rpc: WebSocketRpcClient,
  thread: AppServerThread,
  attached: boolean,
  options: HandoffOptions,
  requestBase = 4,
): Promise<AppServerHandoff> {
  try {
    const synced = await syncThreadToApp(rpc, thread.id, options, [requestBase, requestBase + 1])
    const turnResult = await rpc.request(requestBase + 2, "turn/start", {
      threadId: thread.id,
      input: [{ type: "text", text: options.prompt }],
      cwd: options.cwd,
      ...(options.model ? { model: options.model } : {}),
    })
    return {
      transport: "app-server",
      attached,
      thread,
      turnId: parseTurnId(turnResult),
      // True only when thread/goal/set succeeded. Soft-missing (-32601) leaves this false; turn still started.
      goalSynced: synced.goalSynced,
      error: null,
    }
  } catch (error) {
    if (isThreadNotFound(error)) {
      const fresh = await startProxyThread(rpc, options, requestBase + 10)
      return startProxyTurn(rpc, fresh, false, options, requestBase + 20)
    }
    throw error
  }
}

async function startProxyThread(rpc: WebSocketRpcClient, options: HandoffOptions, requestId = 7): Promise<AppServerThread> {
  const started = await rpc.request(requestId, "thread/start", {
    cwd: options.cwd,
    sandbox: "workspace-write",
    ...(options.model ? { model: options.model } : {}),
  })
  const thread = parseThreadResponse(started)
  if (thread === null) throw new Error("thread/start returned no thread after stale-thread recovery")
  return thread
}

async function resumeProxyThread(
  rpc: WebSocketRpcClient,
  existing: AppServerThread,
  options: HandoffOptions,
): Promise<AppServerThread> {
  const resumed = await rpc.request(3, "thread/resume", {
    threadId: existing.id,
    cwd: options.cwd,
    ...(options.model ? { model: options.model } : {}),
  })
  return parseThreadResponse(resumed) ?? existing
}

async function openProxyThread(rpc: WebSocketRpcClient, options: HandoffOptions, threads: readonly AppServerThread[]): Promise<AppServerThread> {
  if (options.threadId) {
    try {
      const resumed = await rpc.request(3, "thread/resume", {
        threadId: options.threadId,
        cwd: options.cwd,
        ...(options.model ? { model: options.model } : {}),
      })
      const parsedResume = parseThreadResponse(resumed)
      if (parsedResume) return parsedResume
    } catch (error) {
      if (!isThreadNotFound(error)) throw error
    }
    return startProxyThread(rpc, options)
  }
  const result = await rpc.request(3, "thread/start", {
    cwd: options.cwd,
    sandbox: "workspace-write",
    ...(options.model ? { model: options.model } : {}),
  })
  const parsed = parseThreadResponse(result)
  if (parsed) return parsed
  throw new Error(`thread/start returned no thread; ${threads.length} project threads were listed`)
}

async function startDaemon(options: HandoffOptions): Promise<boolean> {
  try {
    const child = options.spawnProcess(options.binary, ["app-server", "daemon", "start"], { env: options.env })
    return await new Promise((resolveReady) => {
      const timer = setTimeout(() => { child.kill(); resolveReady(false) }, options.timeoutMs)
      child.on("error", () => { clearTimeout(timer); resolveReady(false) })
      child.on("close", (code) => { clearTimeout(timer); resolveReady(code === 0) })
    })
  } catch {
    return false
  }
}

async function handoffWithTransport(options: HandoffOptions, args: readonly string[]): Promise<AppServerHandoff> {
  const standalone = args.includes("--stdio")
  const child = options.spawnProcess(options.binary, [...args], {
    env: options.env,
    cwd: options.cwd,
    detached: standalone,
  })
  let handedOff = false
  try {
    await request(child, 1, "initialize", {
      clientInfo: { name: "lfg-handoff", version: "1" },
      capabilities: { experimentalApi: false },
    }, options.timeoutMs)
    notify(child, "initialized")
    const listed = await request(child, 2, "thread/list", {
      cwd: options.cwd,
      limit: 200,
      sortKey: "updated_at",
      sortDirection: "desc",
    }, options.timeoutMs)
    const threads = parseThreadList(listed)
    const existing = selectThread(threads, options.cwd, options.threadId)
    const thread = existing === undefined
      ? await openThread(child, options, threads)
      : await resumeThread(child, existing, options)
    const synced = await syncThreadToApp({
      request: (id, method, params) => request(child, id, method, params, options.timeoutMs),
    }, thread.id, options)
    const turnResult = await request(child, 6, "turn/start", {
      threadId: thread.id,
      input: [{ type: "text", text: options.prompt }],
      cwd: options.cwd,
      ...(options.model ? { model: options.model } : {}),
    }, options.timeoutMs)
    const result: AppServerHandoff = {
      transport: "app-server",
      attached: existing !== undefined,
      thread,
      turnId: parseTurnId(turnResult),
      goalSynced: synced.goalSynced,
      error: null,
    }
    handedOff = true
    if (standalone) releaseStandaloneProcess(child)
    return result
  } finally {
    if (!handedOff || !standalone) child.kill()
  }
}

async function resumeThread(
  child: ChildProcessWithoutNullStreams,
  existing: AppServerThread,
  options: HandoffOptions,
): Promise<AppServerThread> {
  const resumed = await request(child, 3, "thread/resume", {
    threadId: existing.id,
    cwd: options.cwd,
    ...(options.model ? { model: options.model } : {}),
  }, options.timeoutMs)
  return parseThreadResponse(resumed) ?? existing
}

function releaseStandaloneProcess(child: ChildProcessWithoutNullStreams): void {
  child.unref()
  unrefStream(child.stdin)
  unrefStream(child.stdout)
  unrefStream(child.stderr)
}

function unrefStream(stream: unknown): void {
  if (isRefable(stream)) stream.unref()
}

function isRefable(value: unknown): value is { readonly unref: () => void } {
  return typeof value === "object" && value !== null && "unref" in value && typeof value.unref === "function"
}

async function openThread(
  child: ChildProcessWithoutNullStreams,
  options: HandoffOptions,
  threads: readonly AppServerThread[],
): Promise<AppServerThread> {
  if (options.threadId) {
    const resumed = await request(child, 3, "thread/resume", {
      threadId: options.threadId,
      cwd: options.cwd,
      ...(options.model ? { model: options.model } : {}),
    }, options.timeoutMs)
    return parseThreadResponse(resumed) ?? syntheticThread(options.threadId, options.cwd)
  }
  const started = await request(child, 3, "thread/start", {
    cwd: options.cwd,
    sandbox: "workspace-write",
    ...(options.model ? { model: options.model } : {}),
  }, options.timeoutMs)
  const parsed = parseThreadResponse(started)
  if (parsed) return parsed
  throw new Error(`thread/start returned no thread; ${threads.length} project threads were listed`)
}

function request(
  child: ChildProcessWithoutNullStreams,
  id: number,
  method: string,
  params: Readonly<Record<string, unknown>>,
  timeoutMs: number,
): Promise<unknown> {
  return new Promise((resolveValue, reject) => {
    let buffer = ""
    const timer = setTimeout(() => finish(new Error(`${method} timed out after ${timeoutMs}ms`)), timeoutMs)
    const finish = (error?: Error, value?: unknown): void => {
      clearTimeout(timer)
      child.stdout.off("data", onData)
      child.off("error", onError)
      error ? reject(error) : resolveValue(value)
    }
    const onError = (error: Error): void => finish(error)
    const onData = (chunk: Buffer): void => {
      buffer += chunk.toString("utf8")
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""
      for (const line of lines) {
        const message = parseRecord(line)
        if (message?.id !== id) continue
        if (message.error !== undefined) finish(new Error(JSON.stringify(message.error)))
        else finish(undefined, message.result)
        return
      }
    }
    child.on("error", onError)
    child.stdout.on("data", onData)
    child.stdin.write(`${JSON.stringify({ id, method, params })}\n`)
  })
}

function notify(child: ChildProcessWithoutNullStreams, method: string): void {
  child.stdin.write(`${JSON.stringify({ method })}\n`)
}

function selectThread(
  threads: readonly AppServerThread[],
  cwd: string,
  threadId: string | undefined,
): AppServerThread | undefined {
  const liveThreads = threads.filter((thread) => thread.status === "active" || thread.status === "idle")
  if (threadId) return liveThreads.find((thread) => thread.id === threadId || thread.sessionId === threadId)
  const projectRoot = resolve(cwd)
  return liveThreads.find((thread) => thread.cwd !== null && resolve(thread.cwd) === projectRoot)
}

function parseThreadList(value: unknown): readonly AppServerThread[] {
  if (!isRecord(value) || !Array.isArray(value.data)) return []
  return value.data.flatMap((item) => {
    const thread = parseThread(item)
    return thread === null ? [] : [thread]
  })
}

function parseThreadResponse(value: unknown): AppServerThread | null {
  return isRecord(value) ? parseThread(value.thread) : null
}

function parseThread(value: unknown): AppServerThread | null {
  if (!isRecord(value) || typeof value.id !== "string") return null
  const rawStatus = isRecord(value.status) && typeof value.status.type === "string" ? value.status.type : "unknown"
  return {
    id: value.id,
    sessionId: typeof value.sessionId === "string" ? value.sessionId : null,
    cwd: typeof value.cwd === "string" ? value.cwd : null,
    name: typeof value.name === "string" ? value.name : null,
    preview: typeof value.preview === "string" ? value.preview : null,
    status: normalizeStatus(rawStatus),
    updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : null,
  }
}

function parseTurnId(value: unknown): string | null {
  return isRecord(value) && isRecord(value.turn) && typeof value.turn.id === "string" ? value.turn.id : null
}

function syntheticThread(id: string, cwd: string): AppServerThread {
  return { id, sessionId: null, cwd, name: null, preview: null, status: "active", updatedAt: null }
}

function normalizeStatus(value: string): AppServerThreadStatus {
  return value === "active" || value === "idle" || value === "notLoaded" || value === "systemError" ? value : "unknown"
}

function fallback(error: string): AppServerHandoff {
  return { transport: "codex-exec-fallback", attached: false, thread: null, turnId: null, goalSynced: false, error }
}

function shortFocus(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 72)
}

function cleanError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).replace(/\/Users\/[^/]+/g, "~").slice(0, 500)
}

function isThreadNotFound(error: unknown): boolean {
  return error instanceof Error && /thread not found/i.test(error.message)
}

function parseRecord(line: string): Record<string, unknown> | null {
  if (!line.trim()) return null
  try {
    const value: unknown = JSON.parse(line)
    return isRecord(value) ? value : null
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
