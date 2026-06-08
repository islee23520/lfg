import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const ROOT = fileURLToPath(new URL("../../..", import.meta.url))

describe("scripts/build.mjs (#22)", () => {
  test("bundles publish-readiness and npm auth helpers into dist", async () => {
    const script = await readFile(join(ROOT, "scripts/build.mjs"), "utf8")
    expect(script).toContain("publish-readiness.ts")
    expect(script).toContain("npm-publish-auth.ts")
    expect(script).toContain("npm-registry-version.ts")
    expect(script).toContain("npm-publish-bin.ts")
    expect(script).toContain("fixture-minimal")
    expect(script).toContain(".build-")
    expect(script).toContain("rename(fixtureTmp")
  })
})