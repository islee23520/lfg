import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"
import { runGrokDoctor } from "./doctor"
import { mergePortedHooksIntoPlugin } from "./extension-hooks"
import { installGrokPluginFromSource } from "./install"
import { verifyGrokInstallSurface } from "./post-install-verify"

describe("doctor vs post-install-verify (#21)", () => {
  test("installSurface.ok matches verifyGrokInstallSurface on same HOME", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-align-"))
    const source = join(fileURLToPath(import.meta.url), "..", "fixture-minimal")
    const install = await installGrokPluginFromSource({ home, sourceRoot: source })
    await mergePortedHooksIntoPlugin(install.pluginRoot)
    const verify = await verifyGrokInstallSurface({ home })
    const doctor = await runGrokDoctor({ home, moduleUrl: import.meta.url })
    const surface = doctor.installSurface as { ok?: boolean }
    expect(surface.ok).toBe(verify.ok)
    expect(verify.status).toBe("verified")
    expect(doctor.ok).toBe(true)
  })
})
