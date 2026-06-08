import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { describe, expect, test } from "vitest"
import { runGrokDoctor } from "./doctor"
import { installGrokPluginFromSource } from "./install"

describe("doctor cli layout (#22)", () => {
  test("published-workspace when moduleUrl is under npm pack plugins/lfg/dist", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-doc-layout-home-"))
    const installRoot = await mkdtemp(join(tmpdir(), "lfg-doc-layout-pkg-"))
    const here = dirname(fileURLToPath(import.meta.url))
    try {
      await installGrokPluginFromSource({ home, sourceRoot: join(here, "fixture-minimal") })
      await mkdir(join(installRoot, "plugins/lfg/dist"), { recursive: true })
      await writeFile(
        join(installRoot, "package.json"),
        `${JSON.stringify({ name: "@islee23520/lfg", version: "0.1.4", bin: { lfg: "plugins/lfg/lfg" } })}\n`,
      )
      const distPath = join(installRoot, "plugins/lfg/dist/lfg.js")
      await cp(join(here, "..", "dist", "lfg.js"), distPath)
      const doctor = await runGrokDoctor({
        home,
        moduleUrl: pathToFileURL(distPath).href,
        registryVersion: "0.1.3",
      })
      const cli = doctor.cli as { ok?: boolean; layout?: string }
      expect(cli.ok).toBe(true)
      expect(cli.layout).toBe("published-workspace")
      expect(doctor.publishGap).toMatchObject({ registryVersion: "0.1.3", publishReady: true })
    } finally {
      await rm(home, { recursive: true, force: true })
      await rm(installRoot, { recursive: true, force: true })
    }
  })

  test("cli fails when publish root package.json lacks bin.lfg (#22)", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-doc-nobin-home-"))
    const installRoot = await mkdtemp(join(tmpdir(), "lfg-doc-nobin-pkg-"))
    const here = dirname(fileURLToPath(import.meta.url))
    try {
      await installGrokPluginFromSource({ home, sourceRoot: join(here, "fixture-minimal") })
      await mkdir(join(installRoot, "plugins/lfg/dist"), { recursive: true })
      await writeFile(
        join(installRoot, "package.json"),
        `${JSON.stringify({ name: "@islee23520/lfg", version: "0.1.3", workspaces: ["plugins/lfg"] })}\n`,
      )
      const distPath = join(installRoot, "plugins/lfg/dist/lfg.js")
      await cp(join(here, "..", "dist", "lfg.js"), distPath)
      const doctor = await runGrokDoctor({ home, moduleUrl: pathToFileURL(distPath).href })
      const cli = doctor.cli as { ok?: boolean; layout?: string }
      expect(cli.ok).toBe(false)
      expect(cli.layout).not.toBe("published-workspace")
      expect(doctor.ok).toBe(false)
      expect(doctor.failedRequired).toContain("cli")
    } finally {
      await rm(home, { recursive: true, force: true })
      await rm(installRoot, { recursive: true, force: true })
    }
  })
})