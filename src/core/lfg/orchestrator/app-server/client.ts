import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { userInfo } from "node:os"
import { join } from "node:path"
import type { AppServerClient, AppServerSnapshot, AppServerThread, AppServerThreadStatus } from "./types"
import { handoffWithAppServer } from "./handoff"
import { WebSocketRpcClient } from "./websocket-rpc"

type ClientOptions = {
  readonly binary?: string
  readonly env?: Readonly<Record<string, string | undefined>>
  readonly timeoutMs?: number
  readonly spawnProcess?: typeof spawn
}

const RECIPES = [
  "Install or update the standalone Codex CLI, then run: codex app-server daemon start",
  "Fallback monitor: lfg --json orchestrator poll",
] as const

export function createCodexAppServerClient(options: ClientOptions = {}): AppServerClient {
  const envSource = options.env ?? process.env
  const binary = resolveAppServerBinary(options.binary, envSource)
  const timeoutMs = options.timeoutMs ?? resolveAppServerTimeoutMs(envSource)
  const spawnProcess = options.spawnProcess ?? spawn
  const env = appServerEnv(envSource)

  return {
    async snapshot(input): Promise<AppServerSnapshot> {
      let daemonStarted = false
      if (input.startDaemon !== false) {
        daemonStarted = await bestEffortDaemonStart(spawnProcess, binary, env, timeoutMs)
      }
      try {
        const threads = await queryThreadsWithFallback(spawnProcess, binary, env, input.cwd, timeoutMs)
        return { availability: "available", daemonStarted, threads, error: null, recipes: [] }
      } catch (error) {
        return {
          availability: "missing",
          daemonStarted,
          threads: [],
          error: cleanError(error),
          recipes: RECIPES,
        }
      }
    },
    handoff(input) {
      return handoffWithAppServer({
        ...input,
        binary,
        env,
        timeoutMs,
        spawnProcess,
      })
    },
  }
}

export function appServerEnv(source: Readonly<Record<string, string | undefined>>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...source }
  const explicit = source.LFG_CODEX_APP_SERVER_HOME?.trim()
  if (explicit) {
    env.CODEX_HOME = explicit
  } else if (/codex-diet-home|\/tmp\/codex/i.test(source.CODEX_HOME ?? "")) {
    env.CODEX_HOME = join(userInfo().homedir, ".codex")
  }
  return env
}

/** Prefer explicit option, then LFG_CODEX_BINARY env (dedicated shim), else stock `codex`. */
export function resolveAppServerBinary(
  explicit: string | undefined,
  source: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const fromOption = explicit?.trim()
  if (fromOption) return fromOption
  const fromEnv = source.LFG_CODEX_BINARY?.trim()
  if (fromEnv) return fromEnv
  return "codex"
}

/** Default 10s; override with LFG_CODEX_APP_SERVER_TIMEOUT_MS for flaky stock daemons / dedicated servers. */
export function resolveAppServerTimeoutMs(
  source: Readonly<Record<string, string | undefined>> = process.env,
): number {
  const raw = source.LFG_CODEX_APP_SERVER_TIMEOUT_MS?.trim()
  if (!raw) return 10_000
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 100) return 10_000
  return Math.floor(n)
}

async function bestEffortDaemonStart(
  spawnProcess: typeof spawn,
  binary: string,
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
): Promise<boolean> {
  try {
    const result = await collectProcess(spawnProcess(binary, ["app-server", "daemon", "start"], { env }), timeoutMs)
    return result.code === 0
  } catch {
    return false
  }
}

async function queryThreadsWithFallback(
  spawnProcess: typeof spawn,
  binary: string,
  env: NodeJS.ProcessEnv,
  cwd: string | undefined,
  timeoutMs: number,
): Promise<readonly AppServerThread[]> {
  const deadline = Date.now() + timeoutMs
  try {
    return await queryProxyThreads(spawnProcess, binary, env, cwd, remainingTimeout(deadline))
  } catch {
    try {
      return await queryProxyThreads(spawnProcess, binary, env, cwd, remainingTimeout(deadline))
    } catch {
      return queryThreads(spawnProcess, binary, ["app-server", "--stdio"], env, cwd, remainingTimeout(deadline))
    }
  }
}

function remainingTimeout(deadline: number): number {
  return Math.max(1, deadline - Date.now())
}

async function queryProxyThreads(
  spawnProcess: typeof spawn,
  binary: string,
  env: NodeJS.ProcessEnv,
  cwd: string | undefined,
  timeoutMs: number,
): Promise<readonly AppServerThread[]> {
  const child = spawnProcess(binary, ["app-server", "proxy"], { env, ...(cwd ? { cwd } : {}) })
  const rpcClient = new WebSocketRpcClient(child, timeoutMs)
  try {
    await rpcClient.request(1, "initialize", { clientInfo: { name: "lfg-orchestrator-watch", version: "1" }, capabilities: { experimentalApi: false } })
    await rpcClient.notify("initialized")
    return parseThreadList(await rpcClient.request(2, "thread/list", { ...(cwd ? { cwd } : {}), limit: 200, sortKey: "updated_at", sortDirection: "desc" }))
  } finally {
    rpcClient.close()
  }
}

async function queryThreads(
  spawnProcess: typeof spawn,
  binary: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
  cwd: string | undefined,
  timeoutMs: number,
): Promise<readonly AppServerThread[]> {
  const child = spawnProcess(binary, [...args], { env, ...(cwd ? { cwd } : {}) })
  const response = await rpc(child, cwd, timeoutMs)
  return parseThreadList(response)
}

async function rpc(child: ChildProcessWithoutNullStreams, cwd: string | undefined, timeoutMs: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let stdout = ""
    let stderr = ""
    let initialized = false
    let settled = false
    const timer = setTimeout(() => finish(new Error(`codex app-server proxy timed out after ${timeoutMs}ms`)), timeoutMs)
    const finish = (error?: Error, value?: unknown) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      child.kill()
      error ? reject(error) : resolve(value)
    }
    child.on("error", (error) => finish(error))
    child.stderr.on("data", (chunk) => { stderr += String(chunk) })
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk)
      const lines = stdout.split("\n")
      stdout = lines.pop() ?? ""
      for (const line of lines) {
        if (!line.trim()) continue
        let message: Record<string, unknown>
        try { message = JSON.parse(line) as Record<string, unknown> } catch { continue }
        if (message.id === 1 && !initialized) {
          initialized = true
          writeRpc(child, { method: "initialized" })
          setTimeout(() => {
            if (!settled) writeRpc(child, {
              id: 2,
              method: "thread/list",
              params: { ...(cwd ? { cwd } : {}), limit: 200, sortKey: "updated_at", sortDirection: "desc" },
            })
          }, 25)
        } else if (message.id === 2) {
          if (message.error) finish(new Error(JSON.stringify(message.error)))
          else finish(undefined, message.result)
        }
      }
    })
    child.on("close", (code) => {
      if (!settled) finish(new Error(stderr.trim() || `codex app-server proxy exited with code ${code ?? "unknown"}`))
    })
    writeRpc(child, {
      id: 1,
      method: "initialize",
      params: { clientInfo: { name: "lfg-orchestrator-watch", version: "1" }, capabilities: { experimentalApi: false } },
    })
  })
}

function writeRpc(child: ChildProcessWithoutNullStreams, message: Record<string, unknown>): void {
  child.stdin.write(`${JSON.stringify(message)}\n`)
}

function parseThreadList(value: unknown): readonly AppServerThread[] {
  if (!isRecord(value) || !Array.isArray(value.data)) return []
  return value.data.flatMap((item): AppServerThread[] => {
    if (!isRecord(item) || typeof item.id !== "string") return []
    const rawStatus = isRecord(item.status) && typeof item.status.type === "string" ? item.status.type : "unknown"
    return [{
      id: item.id,
      sessionId: typeof item.sessionId === "string" ? item.sessionId : null,
      cwd: typeof item.cwd === "string" ? item.cwd : null,
      name: typeof item.name === "string" ? item.name : null,
      preview: typeof item.preview === "string" ? item.preview : null,
      status: normalizeStatus(rawStatus),
      updatedAt: typeof item.updatedAt === "number" ? item.updatedAt : null,
    }]
  })
}

function normalizeStatus(value: string): AppServerThreadStatus {
  return value === "active" || value === "idle" || value === "notLoaded" || value === "systemError" ? value : "unknown"
}

async function collectProcess(child: ChildProcessWithoutNullStreams, timeoutMs: number): Promise<{ code: number | null }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error("process timed out")) }, timeoutMs)
    child.on("error", reject)
    child.on("close", (code) => { clearTimeout(timer); resolve({ code }) })
  })
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
