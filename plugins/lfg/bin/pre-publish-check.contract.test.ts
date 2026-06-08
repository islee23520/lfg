import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const ROOT = fileURLToPath(new URL("../../..", import.meta.url))

describe("scripts/pre-publish-check.mjs (#22)", () => {
  test("combines evaluatePublishGap and evaluateNpmPublishAuth with exit 2 when not ready", async () => {
    const script = await readFile(join(ROOT, "scripts/pre-publish-check.mjs"), "utf8")
    expect(script).toContain("evaluatePublishGap")
    expect(script).toContain("evaluateNpmPublishAuth")
    expect(script).toContain("parseNpmRegistryVersion")
    expect(script).toContain("isPublishedLfgBinTarget")
    expect(script).toMatch(/process\.exit\(ready \? 0 : 2\)/)
    expect(script).toContain("ready")
    expect(script).toContain("gap.publishReady && auth.ok")
  })
})