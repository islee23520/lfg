import { assert, isRecord } from "../assert"
import { parseJson, runCommand } from "../command"
import type { SmokeCheck } from "../types"

type JsonRpcMessage = Record<string, unknown>

export const mcpSmoke: SmokeCheck = {
  name: "mcp-smoke",
  run(context) {
    const messages: JsonRpcMessage[] = [
      { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
      { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "catalog", arguments: {} } },
      { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "grok_build_catalog", arguments: {} } },
    ]
    const input = `${messages.map((message) => JSON.stringify(message)).join("\n")}\n`
    const result = runCommand(["bun", `${context.paths.pluginRoot}/bin/lfg-mcp.ts`], {
      cwd: context.paths.repoRoot,
      env: { ...context.env, GROK_PLUGIN_ROOT: context.paths.pluginRoot },
      input,
      forwardOutput: false,
    })
    assert(result.stderr.length === 0, `MCP stderr must be isolated, got ${result.stderr}`)
    const lines = result.stdout.trim().split("\n").filter(Boolean)
    assert(lines.length >= messages.length, `expected ${messages.length} MCP responses, got ${lines.length}`)
    const [first, second, shortCall, legacyCall] = lines.slice(0, messages.length).map((line, index) => parseJson<JsonRpcMessage>(line, `MCP response ${index + 1}`))
    assert(isRecord(first.result), "initialize must have result")
    assert(isRecord(first.result.serverInfo), "initialize must include serverInfo")
    assert(first.result.serverInfo.name === "lfg-harness", "MCP server name must be lfg-harness")
    assert(isRecord(second.result), "tools/list must have result")
    assert(Array.isArray(second.result.tools), "tools/list result must include tools")
    const names = new Set(second.result.tools.map((tool) => {
      assert(isRecord(tool) && typeof tool.name === "string", "MCP listed tool must have a string name")
      return tool.name
    }))
    for (const name of ["catalog", "team", "slash"]) assert(names.has(name), `missing MCP tool ${name}`)
    assert(!names.has("grok_build_catalog"), "legacy grok_build_catalog must not be listed")
    assert(!Object.hasOwn(shortCall, "error"), `short MCP call failed: ${JSON.stringify(shortCall)}`)
    assert(!Object.hasOwn(legacyCall, "error"), `legacy MCP call failed: ${JSON.stringify(legacyCall)}`)
    return ["mcp-smoke=ok", "mcp-stdio-isolation=ok", "mcp-stderr-isolated=ok", "mcp-legacy-alias=ok"]
  },
}
