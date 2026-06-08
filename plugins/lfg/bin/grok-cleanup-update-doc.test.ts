import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const ROOT = fileURLToPath(new URL("../../..", import.meta.url))

describe("docs/grok-cleanup-update.md", () => {
  test("documents setup --run and doctor instead of cleanup CLI", async () => {
    const text = await readFile(join(ROOT, "docs/grok-cleanup-update.md"), "utf8")
    expect(text).toContain("setup --run")
    expect(text).toContain("doctor")
    expect(text).toContain("N/A")
    expect(text).not.toContain("lfg cleanup` — implemented")
  })
})