import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { findDeprecatedSetupJsonKeys, setupPostInstallConsistent } from "./setup-json-contract"
import { runLfg } from "./test/test-process"

describe("setup-json-contract (#21)", () => {
  test("successful setup --run has no deprecated adapter repair keys", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-setup-contract-"))
    const result = await runLfg(["--json", "setup", "--run"], {
      HOME: home,
      LFG_DISABLE_DEFAULT_MODELS_PROXY: "1",
    })
    expect(result.exitCode).toBe(0)
    const json = result.json as Record<string, unknown>
    expect(findDeprecatedSetupJsonKeys(json)).toEqual([])
    expect(json).not.toHaveProperty("stablePluginLink")
    expect(json).not.toHaveProperty("mcpConfigRepair")
    expect(json).toMatchObject({ companionPackage: "lfg-grok-install" })
    expect(JSON.stringify(json)).not.toContain("@islee23520/lfp")
    const verify = json.postInstallVerify as { ok?: boolean; status?: string }
    expect(setupPostInstallConsistent(true, verify)).toBe(true)
    expect(verify).toMatchObject({ ok: true, status: "verified" })
  }, 15_000)

  test("findDeprecatedSetupJsonKeys detects legacy fields", () => {
    expect(findDeprecatedSetupJsonKeys({ stablePluginLink: { status: "missing_adapter" } })).toContain("stablePluginLink")
    expect(findDeprecatedSetupJsonKeys({ mcpConfigRepair: {}, stablePluginLinks: [] })).toEqual(
      expect.arrayContaining(["mcpConfigRepair", "stablePluginLinks"]),
    )
    expect(findDeprecatedSetupJsonKeys({ adapter: { found: true } })).toContain("adapter")
  })
})
