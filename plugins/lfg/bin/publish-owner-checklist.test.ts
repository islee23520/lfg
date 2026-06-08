import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const ROOT = fileURLToPath(new URL("../../..", import.meta.url))

/** #22 — owner publish sequence is documented and wired in package scripts. */
describe("publish owner checklist (#22)", () => {
  test("npm-publish.md orders login verify publish smoke", async () => {
    const doc = await readFile(join(ROOT, "docs/npm-publish.md"), "utf8")
    const login = doc.indexOf("npm login")
    const verify = doc.indexOf("npm run verify")
    const publish = doc.indexOf("npm publish")
    const smoke = doc.indexOf("npx @islee23520/lfg")
    expect(login).toBeGreaterThan(-1)
    expect(verify).toBeGreaterThan(login)
    expect(publish).toBeGreaterThan(verify)
    expect(smoke).toBeGreaterThan(publish)
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