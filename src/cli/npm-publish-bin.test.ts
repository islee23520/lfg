import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"
import { isPublishedLfgBinTarget, packageJsonHasBinLfg, PUBLISHED_LFG_BIN_TARGET } from "./npm-publish-bin"

describe("npm-publish-bin (#22)", () => {
  test("true when bin.lfg is non-empty string", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lfg-bin-"))
    try {
      const path = join(dir, "package.json")
      await writeFile(path, `${JSON.stringify({ bin: { lfg: "bin/lfg.js" } })}\n`)
      expect(await packageJsonHasBinLfg(path)).toBe(true)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("false when bin.lfg is workspace dev shim path lfg (#22)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lfg-devbin-"))
    try {
      const path = join(dir, "package.json")
      await writeFile(path, `${JSON.stringify({ bin: { lfg: "lfg" } })}\n`)
      expect(await packageJsonHasBinLfg(path)).toBe(false)
      expect(isPublishedLfgBinTarget("lfg")).toBe(false)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("false when bin.lfg is registry 0.1.3 legacy dist/lfg.js (#22)", () => {
    expect(isPublishedLfgBinTarget("dist/lfg.js")).toBe(false)
  })

  test("false when bin.lfg points at nested dist only (#22)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lfg-wrongbin-"))
    try {
      const path = join(dir, "package.json")
      await writeFile(path, `${JSON.stringify({ bin: { lfg: "dist/lfg.js" } })}\n`)
      expect(await packageJsonHasBinLfg(path)).toBe(false)
      expect(isPublishedLfgBinTarget("dist/lfg.js")).toBe(false)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("false when bin.lfg is empty string (#22)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lfg-emptybin-"))
    try {
      const path = join(dir, "package.json")
      await writeFile(path, `${JSON.stringify({ bin: { lfg: "" } })}\n`)
      expect(await packageJsonHasBinLfg(path)).toBe(false)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("false when bin missing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lfg-nobin-"))
    try {
      await mkdir(dir, { recursive: true })
      const path = join(dir, "package.json")
      await writeFile(path, `${JSON.stringify({ name: "@islee23520/lfg" })}\n`)
      expect(await packageJsonHasBinLfg(path)).toBe(false)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("root repo package.json satisfies publish bin contract (#22)", async () => {
    const root = join(fileURLToPath(new URL("../..", import.meta.url)), "package.json")
    expect(await packageJsonHasBinLfg(root)).toBe(true)
    const pkg = JSON.parse(await readFile(root, "utf8")) as { bin?: { lfg?: string } }
    expect(pkg.bin?.lfg).toBe(PUBLISHED_LFG_BIN_TARGET)
  })
})