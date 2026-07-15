import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, test } from "vitest"
import { createCodexAppServerClient } from "./client"

const roots = new Set<string>()

afterEach(async () => {
  await Promise.all([...roots].map((root) => rm(root, { recursive: true, force: true })))
  roots.clear()
})

describe("Codex app-server handoff", () => {
  test.each([
    { mode: "attach", attached: true, expectedMethod: "turn/start" },
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

    const result = await client.handoff({ cwd: root, prompt: "Implement the requested change" })

    expect(result.transport, JSON.stringify(result)).toBe("app-server")
    expect(result).toMatchObject({
      transport: "app-server",
      attached,
      thread: { id: "thread-project", cwd: root },
      turnId: "turn-1",
    })
    expect(await readFile(log, "utf8")).toContain(expectedMethod)
  })
})

function fakeCodexScript(): string {
  return `#!${process.execPath}
import { appendFileSync } from "node:fs"
const args = process.argv.slice(2)
if (args.includes("daemon")) process.exit(0)
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
    if (message.id === 4) reply(4, { turn: { id: "turn-1" } })
  }
})
function thread() { return { id: "thread-project", sessionId: "session-1", cwd: process.env.LFG_FAKE_CWD, status: { type: "active" }, updatedAt: 1 } }
function reply(id, result) { process.stdout.write(JSON.stringify({ id, result }) + "\\n") }
`
}
