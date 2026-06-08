import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const ROOT = fileURLToPath(new URL("../../..", import.meta.url))

describe("publish checklist #22", () => {
  test("docs/npm-publish.md documents verify and pre-publish-check", async () => {
    const doc = await readFile(join(ROOT, "docs/npm-publish.md"), "utf8")
    expect(doc).toContain("npm run verify")
    expect(doc).toContain("pre-publish-check")
    expect(doc).toContain("npm publish --access public")
    expect(doc).toContain("lfg-smoke")
  })

  test("root package.json exposes bin.lfg and publish scripts", async () => {
    const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8")) as {
      bin?: { lfg?: string }
      scripts?: Record<string, string>
    }
    expect(pkg.bin?.lfg).toBe("plugins/lfg/lfg")
    expect(pkg.scripts?.verify).toContain("assert-pack")
    expect(pkg.scripts?.["pre-publish-check"]).toBeDefined()
  })
})