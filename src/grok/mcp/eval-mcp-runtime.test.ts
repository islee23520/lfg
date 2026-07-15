import { spawn } from "node:child_process"
import { join } from "node:path"

import { beforeAll, describe, expect, test } from "vitest"

async function runMcp(messages: readonly object[]): Promise<unknown[]> {
  const cli = join(process.cwd(), "src/grok/assets/mcp/lfg-eval-mcp.mjs")
  const input = messages.map((m) => `${JSON.stringify(m)}\n`).join("")
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, "mcp"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, LFG_EVAL_CWD: process.cwd() },
    })
    let stdout = ""
    let stderr = ""
    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")
    child.stdout.on("data", (c) => {
      stdout += c
    })
    child.stderr.on("data", (c) => {
      stderr += c
    })
    child.on("error", reject)
    child.on("close", (code) => {
      if (code !== 0 && code !== null) {
        reject(new Error(`eval mcp exited ${code}: ${stderr}`))
        return
      }
      const lines = stdout
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
      resolve(lines.map((l) => JSON.parse(l)))
    })
    child.stdin.write(input)
    child.stdin.end()
  })
}

function toolResult(responses: unknown[], id: number): Record<string, unknown> {
  const row = responses.find((r) => isRecord(r) && r.id === id) as Record<string, unknown> | undefined
  expect(row).toBeDefined()
  const result = isRecord(row?.result) ? row.result : null
  expect(result).not.toBeNull()
  const structured = isRecord(result?.structuredContent) ? result.structuredContent : null
  if (structured) return structured
  const content = Array.isArray(result?.content) ? result.content : []
  const text = content.find((c) => isRecord(c) && c.type === "text")
  if (isRecord(text) && typeof text.text === "string") return JSON.parse(text.text) as Record<string, unknown>
  throw new Error(`no structured content for id ${id}`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

describe("lfg-eval-mcp code mode", () => {
  beforeAll(async () => {
    // warm python availability probe
    await runMcp([
      { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
      { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
    ])
  })

  test("lists eval and eval_reset tools", async () => {
    const responses = await runMcp([
      { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
      { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
    ])
    const list = responses.find((r) => isRecord(r) && r.id === 2) as Record<string, unknown>
    const tools = (isRecord(list.result) && Array.isArray(list.result.tools) ? list.result.tools : []) as Array<{
      name: string
    }>
    expect(tools.map((t) => t.name).sort()).toEqual(["eval", "eval_reset"])
  })

  test("js kernel persists state across cells", async () => {
    const responses = await runMcp([
      { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
      {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "eval", arguments: { language: "js", code: "const x = 21", title: "define" } },
      },
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "eval", arguments: { language: "js", code: "x * 2", title: "use" } },
      },
    ])
    const define = toolResult(responses, 2)
    const use = toolResult(responses, 3)
    expect(define.ok).toBe(true)
    expect(use.ok).toBe(true)
    expect(String(use.stdout)).toContain("42")
  })

  test("py kernel persists state across cells", async () => {
    const responses = await runMcp([
      { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
      {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "eval", arguments: { language: "py", code: "n = 21", title: "define" } },
      },
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "eval", arguments: { language: "py", code: "print(n * 2)", title: "use" } },
      },
    ])
    const define = toolResult(responses, 2)
    const use = toolResult(responses, 3)
    expect(define.ok).toBe(true)
    expect(use.ok).toBe(true)
    expect(String(use.stdout)).toContain("42")
  })

  test("reset clears language state", async () => {
    const responses = await runMcp([
      { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
      {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "eval", arguments: { language: "js", code: "var z = 1" } },
      },
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "eval_reset", arguments: { language: "js" } },
      },
      {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: { name: "eval", arguments: { language: "js", code: "typeof z" } },
      },
    ])
    const after = toolResult(responses, 4)
    expect(after.ok).toBe(true)
    expect(String(after.stdout)).toContain("undefined")
  })

  test("rejects unsupported language", async () => {
    const responses = await runMcp([
      { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
      {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "eval", arguments: { language: "rb", code: "1+1" } },
      },
    ])
    const result = toolResult(responses, 2)
    expect(result.ok).toBe(false)
    expect(String(result.kind)).toBe("unsupported_language")
  })
})
