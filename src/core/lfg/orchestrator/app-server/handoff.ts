import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { resolve } from "node:path"
import type { AppServerHandoff, AppServerThread, AppServerThreadStatus } from "./types"

type HandoffOptions = {
  readonly binary: string
  readonly env: NodeJS.ProcessEnv
  readonly timeoutMs: number
  readonly spawnProcess: typeof spawn
  readonly cwd: string
  readonly prompt: string
  readonly model?: string
  readonly threadId?: string
}

export async function handoffWithAppServer(options: HandoffOptions): Promise<AppServerHandoff> {
  const daemonReady = await startDaemon(options)
  if (!daemonReady) return fallback("codex app-server daemon is unavailable")

  try {
    return await handoffWithTransport(options, ["app-server", "proxy"])
  } catch (proxyError) {
    try {
      return await handoffWithTransport(options, ["app-server", "--stdio"])
    } catch (stdioError) {
      return fallback(cleanError(stdioError instanceof Error ? stdioError : proxyError))
    }
  }
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
  const child = options.spawnProcess(options.binary, [...args], { env: options.env })
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
    const thread = existing ?? await openThread(child, options, threads)
    const turnResult = await request(child, 4, "turn/start", {
      threadId: thread.id,
      input: [{ type: "text", text: options.prompt }],
      cwd: options.cwd,
      ...(options.model ? { model: options.model } : {}),
    }, options.timeoutMs)
    return {
      transport: "app-server",
      attached: existing !== undefined,
      thread,
      turnId: parseTurnId(turnResult),
      error: null,
    }
  } finally {
    child.kill()
  }
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
  if (threadId) return threads.find((thread) => thread.id === threadId || thread.sessionId === threadId)
  const projectRoot = resolve(cwd)
  return threads.find((thread) => thread.cwd !== null && resolve(thread.cwd) === projectRoot)
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
  return { transport: "codex-exec-fallback", attached: false, thread: null, turnId: null, error }
}

function cleanError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).replace(/\/Users\/[^/]+/g, "~").slice(0, 500)
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
