import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { describe, expect, test } from "vitest"
import { installGrokPluginFromSource } from "./install"
import { runGrokDoctor } from "./doctor"

/** #31 — doctor JSON surface after fixture install (omo-equivalent fields). */
describe("doctor JSON contract (#31)", () => {
  test("pass includes distribution, installSurface, checks, and cli from bundle", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-doc-contract-"))
    const source = join(dirname(fileURLToPath(import.meta.url)), "fixture-minimal")
    await installGrokPluginFromSource({ home, sourceRoot: source, version: "7.7.7" })
    const distEntry = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "lfg.js")
    const json = await runGrokDoctor({ home, moduleUrl: pathToFileURL(distEntry).href })
    expect(json).toMatchObject({
      ok: true,
      status: "pass",
      command: "doctor",
      lfgIsPlugin: false,
      failedRequired: [],
    })
    expect(json.distribution).toEqual({ packageName: "@islee23520/lfg", version: "7.7.7" })
    const installSurface = json.installSurface as { ok?: boolean; hooksRegistered?: boolean; nativeHookStatus?: string; bridgeFallback?: boolean }
    expect(installSurface.ok).toBe(true)
    expect(installSurface.hooksRegistered).toBe(true)
    // T9: native parity now implemented (doctor/post-install reports native_grok_events, no bridge fallback for fixture)
    expect(installSurface.nativeHookStatus).toBe("native_grok_events")
    expect(installSurface.bridgeFallback).toBe(false)
    const cli = json.cli as { ok?: boolean; layout?: string; distEntry?: string }
    expect(cli.ok).toBe(true)
    expect(cli.layout).toBe("published-workspace")
    expect(String(cli.distEntry)).toContain("dist/lfg.js")
    const checks = json.checks as readonly { name: string; ok: boolean }[]
    expect(checks.map((c) => c.name)).toEqual(["cli", "grok_install_surface"])
    expect(checks.every((c) => c.ok)).toBe(true)
    expect(String(json.pluginRoot)).toMatch(/plugins[\\/]lfg$/)
    expect(String(json.pluginRoot)).not.toContain("installed-plugins")
    expect(typeof json.configExists).toBe("boolean")
    expect(json.pluginDirName).toBe("lfg")
    const surface = json.installSurface as { pluginRoot?: string; hookNames?: readonly string[]; omoComponents?: readonly string[]; skillWorkflows?: Record<string, boolean> }
    expect(surface.pluginRoot).toBe(json.pluginRoot)
    expect(Array.isArray(surface.hookNames)).toBe(true)
    expect((surface.hookNames ?? []).length).toBeGreaterThan(0)
    // T4 additional expectations for OMO component availability and skill workflow discoverability
    expect(Array.isArray(surface.omoComponents)).toBe(true)
    expect(surface.omoComponents).toContain("ultrawork")
    expect(surface.omoComponents).toContain("rules")
    expect(typeof surface.skillWorkflows).toBe("object")
    expect(surface.skillWorkflows?.["ulw-loop"]).toBe(true)
    expect(surface.skillWorkflows?.["ulw-plan"]).toBe(true)
  })

  test("publishGap when registryVersion supplied (#22/#31)", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-doc-gap-"))
    const source = join(dirname(fileURLToPath(import.meta.url)), "fixture-minimal")
    await installGrokPluginFromSource({ home, sourceRoot: source })
    const distEntry = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "lfg.js")
    const json = await runGrokDoctor({
      home,
      moduleUrl: pathToFileURL(distEntry).href,
      registryVersion: "0.1.3",
    })
    const gap = json.publishGap as { publishReady?: boolean; localVersion?: string } | undefined
    expect(gap).toBeDefined()
    expect(gap?.localVersion).toMatch(/^\d+\.\d+\.\d+$/)
    expect(gap?.publishReady).toBe(true)
  })
})