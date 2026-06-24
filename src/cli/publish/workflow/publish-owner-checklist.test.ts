import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const ROOT = process.cwd()

/** #22 — owner publish sequence is documented (tag-driven, automation-centric) and wired in package scripts. */
describe("publish owner checklist (#22)", () => {
  test("npm-publish.md documents the tag-driven automation flow", async () => {
    const doc = await readFile(join(ROOT, "docs/npm-publish.md"), "utf8")
    // local release procedure: bump version before pushing the tag
    const version = doc.indexOf("npm version")
    const followTags = doc.indexOf("--follow-tags")
    expect(version).toBeGreaterThan(-1)
    expect(followTags).toBeGreaterThan(version)
    // automation wiring
    expect(doc).toContain("lfg.yml")
    expect(doc).toContain("NPM_TOKEN")
    expect(doc).toContain("refs/tags/v")
    expect(doc).toContain("npm publish --access public")
  })

  test("npm-publish.md keeps a manual fallback (login, verify, publish)", async () => {
    const doc = await readFile(join(ROOT, "docs/npm-publish.md"), "utf8")
    expect(doc).toContain("Manual fallback")
    expect(doc).toContain("npm login")
    expect(doc).toContain("npm run verify")
    expect(doc).toContain("npm publish --access public")
  })

  test("root package.json exposes verify and pre-publish-check", async () => {
    const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8")) as {
      scripts?: Record<string, string>
    }
    expect(pkg.scripts?.verify).toContain("assert-pack")
    expect(pkg.scripts?.["pre-publish-check"]).toContain("pre-publish-check.mjs")
    expect(pkg.scripts?.["record-publish-gap"]).toContain("record-publish-gap.mjs")
  })
})
