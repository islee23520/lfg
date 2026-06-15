import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const ROOT = fileURLToPath(new URL("../..", import.meta.url))

describe(".github/workflows/smoke.yml (#12 / epic #26)", () => {
  test("CI verify step runs npm run verify on Node 22", async () => {
    const yaml = await readFile(join(ROOT, ".github/workflows/smoke.yml"), "utf8")
    expect(yaml).toContain('node-version: "22"')
    expect(yaml).toContain("npm run verify")
    expect(yaml).toContain("assert-pack")
    expect(yaml).toContain("npm ci")
    expect(yaml).not.toContain("bun ")
    expect(yaml).not.toContain("oven-sh/setup-bun")
  })
})