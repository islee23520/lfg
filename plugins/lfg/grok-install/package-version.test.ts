import { describe, expect, test } from "vitest"
import { readLfgPackageVersionFromBundle } from "./package-version"

describe("package-version", () => {
  test("reads version from repo root via dist/lfg.js path", async () => {
    const moduleUrl = new URL("../dist/lfg.js", import.meta.url).href
    const version = await readLfgPackageVersionFromBundle(moduleUrl)
    expect(version).toMatch(/^\d+\.\d+\.\d+/)
  })
})