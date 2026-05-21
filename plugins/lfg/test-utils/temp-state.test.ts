import { describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { createTempLfgState } from "./temp-state"
import { collectEvidenceStrings } from "./evidence-helpers"
import { jsonRpcRequest, parseJsonRpcResponse } from "./mcp-helpers"
import { loadFixture } from "./fixture-loader"

describe("LFG TypeScript test utilities", () => {
  test("creates isolated bootstrapped state", async () => {
    const state = await createTempLfgState()
    try {
      expect(existsSync(join(state.data, "state", "schema.json"))).toBe(true)
      expect(state.processEnv.GROK_PLUGIN_DATA).toBe(state.data)
    } finally {
      await state.cleanup()
    }
  })

  test("loads fixtures and evidence strings", async () => {
    const fixture = await loadFixture<{ full_inventory_ids: string[] }>("omo-agent-registry-contract.json")
    expect(fixture.full_inventory_ids).toHaveLength(12)
    expect(collectEvidenceStrings("alpha=ok\nnot evidence\nbeta-1=ok")).toEqual(["alpha=ok", "beta-1=ok"])
  })

  test("builds and parses JSON-RPC helpers", () => {
    expect(jsonRpcRequest(1, "tools/list")).toEqual({ jsonrpc: "2.0", id: 1, method: "tools/list" })
    expect(parseJsonRpcResponse('{"jsonrpc":"2.0","id":1,"result":{"ok":true}}').id).toBe(1)
  })
})
