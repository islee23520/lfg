import { describe, expect, test } from "bun:test"
import { createMcpServer, handleLine, writeResponse } from "./server"
import { createToolDispatcher, type CommandRunResult, type LfgCommandRunner } from "./tools"
import type { JsonRpcResponse } from "./protocol"

const ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/, "")

class FakeRunner implements LfgCommandRunner {
  calls: string[][] = []

  async runRaw(args: string[]): Promise<CommandRunResult> {
    this.calls.push(args)
    return { cmd: ["lfg", "--json", ...args], returncode: 0, stdout: JSON.stringify({ ok: true, command: args.join(" ") }), stderr: "diagnostic on stderr" }
  }
}

describe("TypeScript MCP server", () => {
  test("initialize returns MCP handshake", async () => {
    const server = await createMcpServer({ root: ROOT, serverInfo: { name: "lfg-harness", version: "test" } })
    const response = await server.handleMessage({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} })
    expect(response).toEqual({ jsonrpc: "2.0", id: 1, result: { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "lfg-harness", version: "test" } } })
  })

  test("tools/list exposes canonical short names only", async () => {
    const server = await createMcpServer({ root: ROOT })
    const response = await server.handleMessage({ jsonrpc: "2.0", id: "tools", method: "tools/list" })
    expect(response?.result && typeof response.result === "object" && !Array.isArray(response.result)).toBe(true)
    const tools = response?.result && typeof response.result === "object" && !Array.isArray(response.result) ? response.result.tools : null
    expect(Array.isArray(tools)).toBe(true)
    const names = Array.isArray(tools) ? tools.map((tool) => typeof tool === "object" && tool !== null && !Array.isArray(tool) ? tool.name : null) : []
    expect(names).toContain("status")
    expect(names).toContain("omo_doctor")
    expect(names).not.toContain("grok_build_status")
  })

  test("tools/call dispatches canonical and legacy aliases to runtime commands", async () => {
    const runner = new FakeRunner()
    const dispatcher = await createToolDispatcher({ root: ROOT, runner })
    const server = await createMcpServer({ root: ROOT, dispatcher })
    const canonical = await server.handleMessage({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "plan", arguments: { action: "list" } } })
    const legacy = await server.handleMessage({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "grok_build_plan", arguments: { action: "list" } } })
    expect(canonical?.error).toBeUndefined()
    expect(legacy?.error).toBeUndefined()
    expect(runner.calls).toEqual([["plan", "list"], ["plan", "list"]])
  })

  test("stdout writer emits only JSON-RPC responses", () => {
    const writes: string[] = []
    const originalWrite = process.stdout.write
    process.stdout.write = ((chunk: string | Uint8Array): boolean => {
      writes.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk))
      return true
    }) as typeof process.stdout.write
    try {
      const response: JsonRpcResponse = { jsonrpc: "2.0", id: 4, result: { ok: true } }
      writeResponse(response)
    } finally {
      process.stdout.write = originalWrite
    }
    expect(writes).toEqual([`${JSON.stringify({ jsonrpc: "2.0", id: 4, result: { ok: true } })}\n`])
    expect(JSON.parse(writes[0] ?? "{}")).toEqual({ jsonrpc: "2.0", id: 4, result: { ok: true } })
  })

  test("invalid JSON line returns JSON-RPC parse error", async () => {
    const server = await createMcpServer({ root: ROOT })
    const response = await handleLine(server, "{not-json")
    expect(response?.error?.code).toBe(-32700)
    expect(response?.id).toBeNull()
  })
})
