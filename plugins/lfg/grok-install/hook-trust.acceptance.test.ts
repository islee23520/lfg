import { mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"
import { installGrokPluginFromSource } from "./install"
import { verifyGrokInstallSurface } from "./post-install-verify"
import { validateGrokHooksJson } from "./hook-trust"

/** #28 — installed fixture hooks.json matches Grok hooks schema. */
describe("hook trust acceptance (#28)", () => {
  test("fixture-minimal hooks.json validates from disk", async () => {
    const hooksPath = join(dirname(fileURLToPath(import.meta.url)), "fixture-minimal", "hooks", "hooks.json")
    const parsed: unknown = JSON.parse(await readFile(hooksPath, "utf8"))
    const result = validateGrokHooksJson(parsed)
    expect(result).toEqual({
      ok: true,
      hookNames: ["lfg-visual-guidance"],
      error: null,
    })
  })

  test("rejects hook entry without name field", () => {
    const result = validateGrokHooksJson({ hooks: [{ description: "no name" }] })
    expect(result.ok).toBe(false)
    expect(result.error).toContain("name")
  })

  test("postInstallVerify registers trusted hooks after installGrokPluginFromSource", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-hook28-verify-"))
    const source = join(dirname(fileURLToPath(import.meta.url)), "fixture-minimal")
    await installGrokPluginFromSource({ home, sourceRoot: source, version: "8.8.8" })
    const verify = await verifyGrokInstallSurface({ home })
    expect(verify).toMatchObject({
      ok: true,
      hooksRegistered: true,
      hookNames: ["lfg-visual-guidance"],
      hookTrustError: null,
    })
  })
})