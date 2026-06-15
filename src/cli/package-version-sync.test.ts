import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const ROOT = fileURLToPath(new URL("../..", import.meta.url))

describe("package version sync (#22 publish)", () => {
  test("root package.json has the only package semver", async () => {
    const root = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8")) as { version: string }
    await expect(readFile(join(ROOT, "src", "package.json"), "utf8")).rejects.toMatchObject({ code: "ENOENT" })
    expect(root.version).toMatch(/^\d+\.\d+\.\d+$/)
  })

  test("publish bin is root bin/lfg.js without a workspace shim (#22)", async () => {
    const root = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8")) as { bin?: { lfg?: string } }
    expect(root.bin?.lfg).toBe("bin/lfg.js")
    await expect(readFile(join(ROOT, "src", "lfg"), "utf8")).rejects.toMatchObject({ code: "ENOENT" })
  })
})