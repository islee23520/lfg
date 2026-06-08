import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const ROOT = fileURLToPath(new URL("../../..", import.meta.url))

describe("scripts/assert-npm-pack-bin.mjs (#22)", () => {
  test("required pack paths include root bin shim and dist entry", async () => {
    const script = await readFile(join(ROOT, "scripts/assert-npm-pack-bin.mjs"), "utf8")
    expect(script).toContain("plugins/lfg/lfg")
    expect(script).toContain("plugins/lfg/dist/lfg.js")
    expect(script).toContain("bin.lfg")
    expect(script).toContain("plugins/lfg/lfg")
    expect(script).toContain("bin.lfg must be plugins/lfg/lfg")
    expect(script).not.toContain("plugins/lfg/package.json")
    expect(script).toContain("plugins/lfg/dist/self-test.js")
    expect(script).toContain("publish-readiness.js")
    expect(script).toContain("npm-publish-auth.js")
    expect(script).toContain("npm-registry-version.js")
    expect(script).toContain("npm-publish-bin.js")
    expect(script).toContain("fixture-minimal/hooks/hooks.json")
  })
})