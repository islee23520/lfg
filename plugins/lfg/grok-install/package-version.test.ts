import { readFile } from "node:fs/promises"
import { join } from "node:path"
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
})