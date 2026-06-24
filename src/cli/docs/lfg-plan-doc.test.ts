import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const ROOT = join(fileURLToPath(new URL("../../../", import.meta.url)))

describe("plans/lfg-omo-grok-build-adapter.md (#33)", () => {
  test("header points execution to lfg-omo-grok-adapter.md and epic #26", async () => {
    const text = await readFile(join(ROOT, "plans/lfg-omo-grok-build-adapter.md"), "utf8")
    expect(text).toContain("Superseded")
    expect(text).toContain("plans/lfg-omo-grok-adapter.md")
    expect(text).toMatch(/#26|issues\/26/)
  })
})