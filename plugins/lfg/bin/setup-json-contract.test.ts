import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { findDeprecatedSetupJsonKeys, setupPostInstallConsistent } from "./setup-json-contract"
import { runLfg } from "./test-process"

describe("setup-json-contract (#21)", () => {
  test("successful setup --run has no deprecated adapter repair keys", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-setup-contract-"))
    const fakeBin = await mkdtemp(join(tmpdir(), "lfg-fake-npx-contract2-"))
    const { chmod, writeFile } = await import("node:fs/promises")
    await writeFile(
      join(fakeBin, "npx"),
      `#!/usr/bin/env bash
case "$*" in *lazycodex-ai*) echo fake lazycodex install: $* ;; *) echo unexpected: $* >&2; exit 2 ;; esac
exit 0
`,
      "utf8",
    )
    await chmod(join(fakeBin, "npx"), 0o755)
    const result = await runLfg(["--json", "setup", "--run"], { HOME: home, PATH: `${fakeBin}:${process.env.PATH ?? ""}` })
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
  })

  test("findDeprecatedSetupJsonKeys detects legacy fields", () => {
    expect(findDeprecatedSetupJsonKeys({ stablePluginLink: { status: "missing_adapter" } })).toContain("stablePluginLink")
    expect(findDeprecatedSetupJsonKeys({ mcpConfigRepair: {}, stablePluginLinks: [] })).toEqual(
      expect.arrayContaining(["mcpConfigRepair", "stablePluginLinks"]),
    )
  })
})