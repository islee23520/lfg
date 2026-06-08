import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"
import { packageJsonHasBinLfg } from "./npm-publish-bin"

describe("npm-publish-bin (#22)", () => {
  test("true when bin.lfg is non-empty string", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lfg-bin-"))
    try {
      const path = join(dir, "package.json")
      await writeFile(path, `${JSON.stringify({ bin: { lfg: "plugins/lfg/lfg" } })}\n`)
      expect(await packageJsonHasBinLfg(path)).toBe(true)
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
    const root = join(fileURLToPath(new URL("../../..", import.meta.url)), "package.json")
    expect(await packageJsonHasBinLfg(root)).toBe(true)
    const pkg = JSON.parse(await readFile(root, "utf8")) as { bin?: { lfg?: string } }
    expect(pkg.bin?.lfg).toBe("plugins/lfg/lfg")
  })
})