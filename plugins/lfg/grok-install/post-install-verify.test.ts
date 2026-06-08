import { cp, mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"
import { installGrokPluginFromSource } from "./install"
import { verifyGrokInstallSurface } from "./post-install-verify"

describe("post-install-verify", () => {
  test("verified after internal install stamp", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-verify-home-"))
    const source = join(dirname(fileURLToPath(import.meta.url)), "fixture-minimal")
    await installGrokPluginFromSource({ home, sourceRoot: source, version: "9.9.9" })
    const json = await verifyGrokInstallSurface({ home })
    expect(json).toMatchObject({
      ok: true,
      status: "verified",
      distribution: { packageName: "@islee23520/lfg", version: "9.9.9" },
      hooksRegistered: true,
      hookNames: ["lfg-visual-guidance"],
    })
  })

  test("missing_adapter when plugin tree absent", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-verify-empty-"))
    await mkdir(join(home, ".grok"), { recursive: true })
    const json = await verifyGrokInstallSurface({ home })
    expect(json.ok).toBe(false)
    expect(json.status).toBe("missing_adapter")
  })

  test("missing_adapter when hooks.json invalid (#28 hook trust)", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-verify-bad-hooks-"))
    const source = await mkdtemp(join(tmpdir(), "lfg-verify-bad-src-"))
    await mkdir(join(source, "hooks"), { recursive: true })
    await writeFile(join(source, "hooks", "hooks.json"), '{"notHooks":[]}\n', "utf8")
    await installGrokPluginFromSource({ home, sourceRoot: source, version: "1.0.0" })
    const json = await verifyGrokInstallSurface({ home })
    expect(json.ok).toBe(false)
    expect(json.status).toBe("missing_adapter")
    expect(json.hooksRegistered).toBe(false)
    expect(String(json.hookTrustError)).toContain("hooks")
  })
})