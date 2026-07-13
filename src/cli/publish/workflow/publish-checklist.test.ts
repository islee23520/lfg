import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const ROOT = process.cwd()

describe("publish checklist #22", () => {
  test("docs/npm-publish.md documents verify and pre-publish-check", async () => {
    const doc = await readFile(join(ROOT, "docs/npm-publish.md"), "utf8")
    expect(doc).toContain("npm run verify")
    expect(doc).toContain("pre-publish-check.mjs")
    expect(doc).toContain("npm publish --access public")
    expect(doc).toContain("lfg-smoke")
    expect(doc).toContain("npx @islee23520/lfg --json setup")
    expect(doc).toContain("record-publish-gap.mjs")
    expect(doc).toContain("assert-npm-publish-auth.mjs")
    expect(doc).toContain("npm login")
    // tag-driven automation wiring
    expect(doc).toContain("lfg.yml")
    expect(doc).toContain("NPM_TOKEN")
  })

  test("root package.json exposes bin.lfg and core verify scripts", async () => {
    const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8")) as {
      bin?: { lfg?: string }
      scripts?: Record<string, string>
    }
    expect(pkg.bin?.lfg).toBe("bin/lfg.js")
    expect(pkg.scripts?.verify).toContain("assert-pack")
    expect(pkg.scripts?.["assert-omo-parity"]).toBe("npm run build && node scripts/assert-omo-parity.mjs")
    expect(pkg.scripts?.verify).toBe(
      "npm run assert-pack && npm run assert-omo-parity && npm run assert-skills-smoke && npm test && npm run coverage:ulw-loop && npm run typecheck && npm run self-test",
    )
    expect(pkg.scripts?.["assert-skills-smoke"]).toBe("node scripts/assert-skills-smoke.mjs")
    expect(pkg.scripts?.["coverage:ulw-loop"]).toContain("--coverage")
    expect(pkg.scripts).not.toHaveProperty("pre-publish-check")
    expect(pkg.scripts).not.toHaveProperty("record-publish-gap")
    expect(pkg.scripts).not.toHaveProperty("assert-publish-auth")
  })
})
