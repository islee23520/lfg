import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"
import { PUBLISHED_LFG_BIN_TARGET } from "./npm-publish-bin"

const ROOT = fileURLToPath(new URL("../..", import.meta.url))

/** #22 — publish contract: root tarball is @islee23520/lfg, not nested src workspace package. */
describe("npm publish root contract (#22)", () => {
  test("root package is publish surface with bin on root package.json only", async () => {
    const root = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8")) as {
      name: string
      bin?: { lfg?: string }
      workspaces?: readonly string[]
    }
    expect(root.name).toBe("@islee23520/lfg")
    expect(root.bin?.lfg).toBe(PUBLISHED_LFG_BIN_TARGET)
    expect(root.workspaces).toBeUndefined()
  })

  test("there is no nested src package publish surface", async () => {
    await expect(readFile(join(ROOT, "src", "package.json"), "utf8")).rejects.toMatchObject({ code: "ENOENT" })
    const doc = await readFile(join(ROOT, "docs/npm-publish.md"), "utf8")
    expect(doc).toContain("repository root")
    expect(doc).not.toContain("workspace dev only")
  })

  test("docs/npm-publish.md forbids workspace-only publish that caused #22", async () => {
    const doc = await readFile(join(ROOT, "docs/npm-publish.md"), "utf8")
    expect(doc).toContain("repository root")
    expect(doc).toContain("could not determine executable")
    expect(doc).toContain("fileCount")
  })
})