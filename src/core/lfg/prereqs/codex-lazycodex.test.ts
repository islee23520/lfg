import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import {
  codexInstallRecipes,
  gjcInstallRecipes,
  lazycodexInstallRecipes,
  probeCodexLazyCodexPrereqs,
  resolvePrereqPlatform,
} from "./codex-lazycodex"

describe("codex-lazycodex prereqs", () => {
  test("resolves platforms and exposes OS-valid codex recipes", () => {
    expect(resolvePrereqPlatform("darwin")).toBe("darwin")
    expect(resolvePrereqPlatform("win32")).toBe("win32")
    expect(codexInstallRecipes("darwin").some((r) => r.shellHint.includes("install.sh"))).toBe(true)
    expect(codexInstallRecipes("win32").some((r) => r.shellHint.includes("install.ps1"))).toBe(true)
    expect(codexInstallRecipes("linux").every((r) => !r.shellHint.includes("install.ps1"))).toBe(true)
    expect(lazycodexInstallRecipes("darwin")).toEqual([])
    expect(gjcInstallRecipes("darwin").map((recipe) => recipe.shellHint)).toEqual([
      "bun install -g @gajae-code/coding-agent",
      "npm install -g @gajae-code/coding-agent",
    ])
  })

  test("detects missing tools when PATH and codex home are empty", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-prereq-empty-"))
    const report = await probeCodexLazyCodexPrereqs({
      home,
      env: { HOME: home, PATH: home },
      platform: "darwin",
    })
    expect(report.ok).toBe(false)
    expect(report.missing).toEqual(["codex"])
    expect(report.recommendedMissing).toEqual(["gjc", "agy"])
    expect(report.codex.status).toBe("missing")
    expect(report.lazycodex.status).toBe("missing")
    expect(report.lazycodex.required).toBe(false)
    expect(report.lazycodex.recipes).toEqual([])
    expect(report.gjc.status).toBe("missing")
  })

  test("treats Codex as the sole required prerequisite", async () => {
    // Given
    const home = await mkdtemp(join(tmpdir(), "lfg-prereq-codex-only-"))
    const bin = join(home, "bin")
    await mkdir(bin, { recursive: true })
    const codexBin = join(bin, "codex")
    await writeFile(codexBin, "#!/bin/sh\necho ok\n", { mode: 0o755 })

    // When
    const report = await probeCodexLazyCodexPrereqs({
      home,
      env: { HOME: home, PATH: bin },
      platform: "darwin",
    })

    // Then
    expect(report.ok).toBe(true)
    expect(report.missing).toEqual([])
    expect(report.codex.required).toBe(true)
    expect(report.lazycodex.required).toBe(false)
    expect(report.lazycodex.ok).toBe(false)
  })

  test("detects codex binary and lazycodex cache", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-prereq-ready-"))
    const bin = join(home, "bin")
    await mkdir(bin, { recursive: true })
    const codexBin = join(bin, "codex")
    await writeFile(codexBin, "#!/bin/sh\necho ok\n", { mode: 0o755 })
    const gjcBin = join(bin, "gjc")
    await writeFile(gjcBin, "#!/bin/sh\necho ok\n", { mode: 0o755 })
    const agyBin = join(bin, "agy")
    await writeFile(agyBin, "#!/bin/sh\necho ok\n", { mode: 0o755 })
    const cache = join(home, ".codex", "plugins", "cache", "sisyphuslabs", "omo")
    await mkdir(cache, { recursive: true })
    await writeFile(join(cache, "marker"), "1\n")

    const report = await probeCodexLazyCodexPrereqs({
      home,
      env: { HOME: home, PATH: bin },
      platform: "darwin",
    })
    expect(report.ok).toBe(true)
    expect(report.codex.status).toBe("ready")
    expect(report.codex.commandPath).toBe(codexBin)
    expect(report.lazycodex.status).toBe("ready")
    expect(report.gjc.status).toBe("ready")
    expect(report.gjc.commandPath).toBe(gjcBin)
    expect(report.agy.commandPath).toBe(agyBin)
    expect(report.missing).toEqual([])
    expect(report.recommendedMissing).toEqual([])
  })
})
