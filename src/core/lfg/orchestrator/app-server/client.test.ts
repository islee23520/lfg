import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { spawn, spawnSync } from "node:child_process"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, test } from "vitest"
import { createCodexAppServerClient, resolveAppServerBinary, resolveAppServerTimeoutMs } from "./client"

const roots = new Set<string>()

afterEach(async () => {
  await Promise.all([...roots].map((root) => rm(root, { recursive: true, force: true })))
  roots.clear()
})

describe("Codex app-server handoff", () => {
  test("resolves dedicated LFG_CODEX_BINARY and timeout env overrides", () => {
    expect(resolveAppServerBinary(undefined, {})).toBe("codex")
    expect(resolveAppServerBinary(" /opt/shim ", {})).toBe("/opt/shim")
    expect(resolveAppServerBinary(undefined, { LFG_CODEX_BINARY: " /tmp/dedicated-codex " })).toBe("/tmp/dedicated-codex")
    expect(resolveAppServerTimeoutMs({})).toBe(10_000)
    expect(resolveAppServerTimeoutMs({ LFG_CODEX_APP_SERVER_TIMEOUT_MS: "30000" })).toBe(30_000)
    expect(resolveAppServerTimeoutMs({ LFG_CODEX_APP_SERVER_TIMEOUT_MS: "nope" })).toBe(10_000)
  })

  test.runIf(
    process.env.LFG_RUN_CODEX_APP_SERVER_LIVE === "1" &&
    spawnSync("codex", ["--version"], { encoding: "utf8" }).status === 0,
  )(
    "lists project threads through the installed Codex app-server binary",
    async () => {
      const client = createCodexAppServerClient()

      const snapshot = await client.snapshot({ cwd: process.cwd(), startDaemon: true })

      expect(snapshot, JSON.stringify(snapshot)).toMatchObject({
        availability: "available",
        error: null,
      })
    },
    20_000,
  )

  test("speaks WebSocket JSON-RPC through the daemon proxy", async () => {
    const root = await mkdtemp(join(tmpdir(), "lfg-app-server-proxy-"))
    roots.add(root)
    const binary = join(root, "codex-proxy-fake.mjs")
    await writeFile(binary, fakeWebSocketProxyScript(), "utf8")
    await chmod(binary, 0o755)
    const client = createCodexAppServerClient({ binary, env: { LFG_FAKE_CWD: root }, timeoutMs: 2_000 })

    const snapshot = await client.snapshot({ cwd: root })

    expect(snapshot).toMatchObject({
      availability: "available",
      daemonStarted: true,
      error: null,
      threads: [{ id: "thread-proxy" }],
    })
  })

  test("starts the daemon first and softly retries the WebSocket proxy", async () => {
    const root = await mkdtemp(join(tmpdir(), "lfg-app-server-retry-"))
    roots.add(root)
    const binary = join(root, "codex-proxy-fake.mjs")
    await writeFile(binary, fakeWebSocketProxyScript(), "utf8")
    await chmod(binary, 0o755)
    const calls: string[][] = []
    let proxyAttempts = 0
    const spawnProcess = ((command: string, args: readonly string[], options: Parameters<typeof spawn>[2]) => {
      const argv = args
      calls.push([...argv])
      if (argv.includes("proxy") && proxyAttempts++ === 0) {
        return spawn(process.execPath, ["-e", "process.exit(1)"], options ?? {})
      }
      return spawn(command, args, options ?? {})
    }) as typeof spawn
    const client = createCodexAppServerClient({
      binary,
      env: { LFG_FAKE_CWD: root },
      timeoutMs: 2_000,
      spawnProcess,
    })

    const snapshot = await client.snapshot({ cwd: root })

    expect(snapshot.availability, JSON.stringify(snapshot)).toBe("available")
    expect(calls).toEqual([
      ["app-server", "daemon", "start"],
      ["app-server", "proxy"],
      ["app-server", "proxy"],
    ])
  })

  test("bounds proxy retries and stdio fallback by one thread-list deadline", async () => {
    const root = await mkdtemp(join(tmpdir(), "lfg-app-server-deadline-"))
    roots.add(root)
    const binary = join(root, "codex-hang.mjs")
    await writeFile(binary, `#!${process.execPath}\nprocess.stdin.resume()\n`, "utf8")
    await chmod(binary, 0o755)
    const client = createCodexAppServerClient({ binary, timeoutMs: 120 })
    const startedAt = Date.now()

    const snapshot = await client.snapshot({ cwd: root, startDaemon: false })

    expect(snapshot.availability).toBe("missing")
    expect(Date.now() - startedAt).toBeLessThan(220)
    expect(snapshot.error).toContain("timed out")
  })

  test("falls back from a hung goal handoff within one app-server deadline", async () => {
    const root = await mkdtemp(join(tmpdir(), "lfg-app-server-handoff-deadline-"))
    roots.add(root)
    const binary = join(root, "codex-handoff-hang.mjs")
    await writeFile(
      binary,
      `#!${process.execPath}\nif (process.argv.includes("daemon")) process.exit(0)\nprocess.stdin.resume()\n`,
      "utf8",
    )
    await chmod(binary, 0o755)
    const client = createCodexAppServerClient({ binary, timeoutMs: 120 })
    const startedAt = Date.now()

    const result = await client.handoff({ cwd: root, prompt: "Fallback without blocking goal drive" })

    expect(result.transport).toBe("codex-exec-fallback")
    expect(Date.now() - startedAt).toBeLessThan(220)
    expect(result.error).toContain("timed out")
  })

  test("starts a new proxy thread when a listed live thread is stale", async () => {
    const root = await mkdtemp(join(tmpdir(), "lfg-app-server-stale-"))
    roots.add(root)
    const binary = join(root, "codex-proxy-fake.mjs")
    const log = join(root, "rpc.log")
    await writeFile(binary, fakeWebSocketProxyScript(), "utf8")
    await chmod(binary, 0o755)
    const client = createCodexAppServerClient({
      binary,
      env: { LFG_FAKE_CWD: root, LFG_FAKE_LOG: log, LFG_FAKE_PROXY_STALE: "1" },
      timeoutMs: 2_000,
    })

    const result = await client.handoff({ cwd: root, prompt: "Recover stale goal work" })

    const methods = (await readFile(log, "utf8")).trim().split("\n")
    expect(result, JSON.stringify({ result, methods })).toMatchObject({
      transport: "app-server",
      attached: false,
      thread: { id: "thread-fresh" },
      goalSynced: true,
      turnId: "turn-fresh",
    })
    expect(methods).toEqual([
      "initialize",
      "initialized",
      "thread/list",
      "thread/resume",
      "thread/start",
      "thread/name/set",
      "thread/goal/set",
      "turn/start",
    ])
  })

  test.each([
    { mode: "attach", attached: true, expectedMethod: "thread/resume" },
    { mode: "create", attached: false, expectedMethod: "thread/start" },
  ])("$mode project thread and starts its turn", async ({ mode, attached, expectedMethod }) => {
    const root = await mkdtemp(join(tmpdir(), "lfg-app-server-client-"))
    roots.add(root)
    const binary = join(root, "codex-fake.mjs")
    const log = join(root, "rpc.log")
    await writeFile(binary, fakeCodexScript(), "utf8")
    await chmod(binary, 0o755)
    const client = createCodexAppServerClient({
      binary,
      env: { LFG_FAKE_MODE: mode, LFG_FAKE_CWD: root, LFG_FAKE_LOG: log },
      timeoutMs: 2_000,
    })

    const result = await client.handoff({
      cwd: root,
      prompt: "Implement the requested change",
      threadName: "lfg/goal: requested change",
      goal: { objective: "Implement the requested change", status: "active" },
    })

    expect(result.transport, JSON.stringify(result)).toBe("app-server")
    expect(result).toMatchObject({
      transport: "app-server",
      attached,
      thread: { id: "thread-project", cwd: root },
      turnId: "turn-1",
      goalSynced: true,
    })
    const methods = (await readFile(log, "utf8")).trim().split("\n")
    expect(methods).toContain(expectedMethod)
    if (attached) expect(methods.indexOf("thread/resume")).toBeLessThan(methods.indexOf("thread/name/set"))
    expect(methods.slice(-3)).toEqual(["thread/name/set", "thread/goal/set", "turn/start"])
  })

  test("uses standalone stdio when daemon start is unavailable", async () => {
    const root = await mkdtemp(join(tmpdir(), "lfg-app-server-daemon-fallback-"))
    roots.add(root)
    const binary = join(root, "codex-fake.mjs")
    const log = join(root, "rpc.log")
    await writeFile(binary, fakeCodexScript(), "utf8")
    await chmod(binary, 0o755)
    const calls: string[][] = []
    const spawnProcess = ((command: string, args: readonly string[], options: Parameters<typeof spawn>[2]) => {
      calls.push([...args])
      return spawn(command, args, options ?? {})
    }) as typeof spawn
    const client = createCodexAppServerClient({
      binary,
      env: { LFG_FAKE_MODE: "create", LFG_FAKE_CWD: root, LFG_FAKE_LOG: log, LFG_FAKE_DAEMON_FAIL: "1" },
      timeoutMs: 2_000,
      spawnProcess,
    })

    const result = await client.handoff({ cwd: root, prompt: "Use the standalone transport" })

    expect(result.transport, JSON.stringify(result)).toBe("app-server")
    expect(await readFile(log, "utf8")).toContain("turn/start")
    expect(calls).toEqual([
      ["app-server", "daemon", "start"],
      ["app-server", "--stdio"],
    ])
    expect(calls.some((argv) => argv.includes("exec"))).toBe(false)
  })

  test("soft-misses thread/goal/set (-32601) and still starts the turn with goalSynced false", async () => {
    const root = await mkdtemp(join(tmpdir(), "lfg-app-server-no-goal-set-"))
    roots.add(root)
    const binary = join(root, "codex-fake.mjs")
    const log = join(root, "rpc.log")
    await writeFile(binary, fakeCodexScript(), "utf8")
    await chmod(binary, 0o755)
    const client = createCodexAppServerClient({
      binary,
      env: {
        LFG_FAKE_MODE: "create",
        LFG_FAKE_CWD: root,
        LFG_FAKE_LOG: log,
        LFG_FAKE_DAEMON_FAIL: "1",
        LFG_FAKE_NO_GOAL_SET: "1",
      },
      timeoutMs: 2_000,
    })

    const result = await client.handoff({
      cwd: root,
      prompt: "Senpi-compatible host without goal/set",
      goal: { objective: "Senpi-compatible host without goal/set", status: "active" },
    })

    expect(result).toMatchObject({
      transport: "app-server",
      thread: { id: "thread-project" },
      turnId: "turn-1",
      goalSynced: false,
      error: null,
    })
    const methods = (await readFile(log, "utf8")).trim().split("\n")
    expect(methods).toContain("thread/goal/set")
    expect(methods).toContain("turn/start")
  })

  test("keeps standalone stdio alive after turn acknowledgement", async () => {
    const root = await mkdtemp(join(tmpdir(), "lfg-app-server-stdio-lifecycle-"))
    roots.add(root)
    const binary = join(root, "codex-fake.mjs")
    const log = join(root, "rpc.log")
    const lifecycle = join(root, "lifecycle.log")
    await writeFile(binary, fakeCodexScript(), "utf8")
    await chmod(binary, 0o755)
    const client = createCodexAppServerClient({
      binary,
      env: {
        LFG_FAKE_MODE: "create",
        LFG_FAKE_CWD: root,
        LFG_FAKE_LOG: log,
        LFG_FAKE_LIFECYCLE: lifecycle,
        LFG_FAKE_DAEMON_FAIL: "1",
      },
      timeoutMs: 2_000,
    })

    const result = await client.handoff({ cwd: root, prompt: "Finish after acknowledgement" })

    expect(result.transport, JSON.stringify(result)).toBe("app-server")
    await expect(readEventually(lifecycle)).resolves.toContain("completed")
    expect(await readFile(lifecycle, "utf8")).not.toContain("killed")
    expect(await readFile(lifecycle, "utf8")).not.toContain("stdin-ended")
  })
})

function fakeCodexScript(): string {
  return `#!${process.execPath}
import { appendFileSync } from "node:fs"
const args = process.argv.slice(2)
if (args.includes("daemon")) process.exit(process.env.LFG_FAKE_DAEMON_FAIL === "1" ? 1 : 0)
if (args.includes("proxy") && process.env.LFG_FAKE_DAEMON_FAIL === "1") process.exit(1)
process.on("SIGTERM", () => {
  if (process.env.LFG_FAKE_LIFECYCLE) appendFileSync(process.env.LFG_FAKE_LIFECYCLE, "killed\\n")
  process.exit(0)
})
process.stdin.on("end", () => {
  if (process.env.LFG_FAKE_LIFECYCLE) appendFileSync(process.env.LFG_FAKE_LIFECYCLE, "stdin-ended\\n")
})
let buffer = ""
process.stdin.on("data", (chunk) => {
  buffer += chunk.toString("utf8")
  const lines = buffer.split("\\n")
  buffer = lines.pop() ?? ""
  for (const line of lines) {
    if (!line.trim()) continue
    const message = JSON.parse(line)
    appendFileSync(process.env.LFG_FAKE_LOG, message.method + "\\n")
    if (message.id === 1) reply(1, {})
    if (message.id === 2) reply(2, { data: process.env.LFG_FAKE_MODE === "attach" ? [thread()] : [] })
    if (message.id === 3) reply(3, { thread: thread() })
    if (message.method === "thread/name/set") reply(message.id, {})
    if (message.method === "thread/goal/set") {
      if (process.env.LFG_FAKE_NO_GOAL_SET === "1") {
        process.stdout.write(JSON.stringify({ id: message.id, error: { code: -32601, message: "Method not found: thread/goal/set" } }) + "\\n")
      } else {
        reply(message.id, {})
      }
    }
    if (message.method === "turn/start") {
      reply(message.id, { turn: { id: "turn-1" } })
      if (process.env.LFG_FAKE_LIFECYCLE) setTimeout(() => {
        appendFileSync(process.env.LFG_FAKE_LIFECYCLE, "completed\\n")
        process.exit(0)
      }, 50)
    }
  }
})
function thread() { return { id: "thread-project", sessionId: "session-1", cwd: process.env.LFG_FAKE_CWD, status: { type: "active" }, updatedAt: 1 } }
function reply(id, result) { process.stdout.write(JSON.stringify({ id, result }) + "\\n") }
`
}

function fakeWebSocketProxyScript(): string {
  return `#!${process.execPath}
import { createHash } from "node:crypto"
import { appendFileSync } from "node:fs"
const args = process.argv.slice(2)
if (args.includes("daemon")) {
  process.stdout.write(JSON.stringify({ status: "alreadyRunning" }) + "\\n")
  process.exit(0)
}
let buffer = Buffer.alloc(0)
let upgraded = false
process.stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk])
  if (!upgraded) {
    const end = buffer.indexOf("\\r\\n\\r\\n")
    if (end < 0) return
    const request = buffer.subarray(0, end + 4).toString("utf8")
    const key = request.match(/Sec-WebSocket-Key: ([^\\r\\n]+)/i)?.[1]
    if (!key) process.exit(2)
    const accept = createHash("sha1").update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64")
    process.stdout.write("HTTP/1.1 101 Switching Protocols\\r\\nConnection: Upgrade\\r\\nUpgrade: websocket\\r\\nSec-WebSocket-Accept: " + accept + "\\r\\n\\r\\n")
    buffer = buffer.subarray(end + 4)
    upgraded = true
  }
  for (;;) {
    const frame = readFrame(buffer)
    if (!frame) return
    buffer = buffer.subarray(frame.bytes)
    const message = JSON.parse(frame.payload.toString("utf8"))
    if (process.env.LFG_FAKE_LOG) appendFileSync(process.env.LFG_FAKE_LOG, message.method + "\\n")
    if (message.id === 1) send({ id: 1, result: {} })
    if (message.id === 2) send({ id: 2, result: { data: [{ id: "thread-proxy", cwd: process.env.LFG_FAKE_CWD, status: { type: "idle" }, updatedAt: 1 }] } })
    if (message.method === "thread/resume" && process.env.LFG_FAKE_PROXY_STALE === "1") send({ id: message.id, error: { code: -32600, message: "thread not found: thread-proxy" } })
    if (message.method === "thread/start") {
      send({ id: message.id, result: { thread: { id: "thread-fresh" } } })
    }
    if (message.method === "thread/name/set") send({ id: message.id, result: {} })
    if (message.method === "thread/goal/set") {
      if (process.env.LFG_FAKE_NO_GOAL_SET === "1") send({ id: message.id, error: { code: -32601, message: "Method not found: thread/goal/set" } })
      else send({ id: message.id, result: {} })
    }
    if (message.method === "turn/start") send({ id: message.id, result: { turn: { id: "turn-fresh" } } })
  }
})
function readFrame(input) {
  if (input.length < 2) return null
  let length = input[1] & 0x7f
  let offset = 2
  if (length === 126) {
    if (input.length < 4) return null
    length = input.readUInt16BE(2)
    offset = 4
  }
  if (input.length < offset + 4 + length) return null
  const mask = input.subarray(offset, offset + 4)
  offset += 4
  const payload = Buffer.from(input.subarray(offset, offset + length))
  for (let index = 0; index < payload.length; index += 1) payload[index] ^= mask[index % 4]
  return { payload, bytes: offset + length }
}
function send(message) {
  const payload = Buffer.from(JSON.stringify(message))
  const header = payload.length < 126 ? Buffer.from([0x81, payload.length]) : Buffer.from([0x81, 126, payload.length >> 8, payload.length & 0xff])
  process.stdout.write(Buffer.concat([header, payload]))
}
`
}

async function readEventually(path: string): Promise<string> {
  const deadline = Date.now() + 1_000
  while (Date.now() < deadline) {
    try {
      return await readFile(path, "utf8")
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
  }
  return readFile(path, "utf8")
}
