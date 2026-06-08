import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const ROOT = fileURLToPath(new URL("../../..", import.meta.url))

describe("scripts/assert-npm-publish-auth.mjs (#22)", () => {
  test("uses dist npm-publish-auth and exits on auth", async () => {
    const script = await readFile(join(ROOT, "scripts/assert-npm-publish-auth.mjs"), "utf8")
    expect(script).toContain("npm-publish-auth.js")
    expect(script).toContain("evaluateNpmPublishAuth")
    expect(script).toContain("whoami")
    expect(script).toMatch(/process\.exit\(auth\.ok \? 0 : 2\)/)
  })
})