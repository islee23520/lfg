import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"
import { readLfgPackageVersionFromBundle } from "./package-version"

const ROOT = join(fileURLToPath(new URL("../..", import.meta.url)), "..")

describe("package-version", () => {
  test("reads version from repo root via dist/lfg.js path", async () => {
    const moduleUrl = new URL("../dist/lfg.js", import.meta.url).href
    const version = await readLfgPackageVersionFromBundle(moduleUrl)
    expect(version).toMatch(/^\d+\.\d+\.\d+/)
  })

  test("matches root package.json for npm pack layout (#22)", async () => {
    const moduleUrl = new URL("../dist/lfg.js", import.meta.url).href
    const fromBundle = await readLfgPackageVersionFromBundle(moduleUrl)
    const root = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8")) as { version: string }
    expect(fromBundle).toBe(root.version)
  })

  test("reads npm pack layout root version two levels above dist (#22)", async () => {
    const installRoot = await mkdtemp(join(tmpdir(), "lfg-pkg-ver-"))
    try {
      await mkdir(join(installRoot, "plugins/lfg/dist"), { recursive: true })
      await writeFile(
        join(installRoot, "package.json"),
        `${JSON.stringify({ name: "@islee23520/lfg", version: "9.9.9", bin: { lfg: "plugins/lfg/lfg" } })}\n`,
      )
      const distPath = join(installRoot, "plugins/lfg/dist/lfg.js")
      await writeFile(distPath, "export {}\n")
      const version = await readLfgPackageVersionFromBundle(pathToFileURL(distPath).href)
      expect(version).toBe("9.9.9")
    } finally {
      await rm(installRoot, { recursive: true, force: true })
    }
  })
})