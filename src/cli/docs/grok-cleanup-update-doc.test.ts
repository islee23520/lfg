import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const ROOT = fileURLToPath(new URL("../../../", import.meta.url))

describe("docs/grok-cleanup-update.md (#34)", () => {
  test("documents setup --run verification instead of cleanup CLI", async () => {
    const text = await readFile(join(ROOT, "docs/grok-cleanup-update.md"), "utf8")
    expect(text).toContain("setup --run")
    expect(text).toContain("Verify install")
    expect(text).toContain("inspect the JSON result")
    expect(text).toContain("N/A")
    expect(text).toContain("runGrokInstall")
    expect(text).not.toContain("lfg cleanup` — implemented")
  })

  test("parity doc records cleanup/update as N/A with doc test ref", async () => {
    const parity = await readFile(join(ROOT, "docs/grok-adapter-parity.md"), "utf8")
    expect(parity).toMatch(/\| `cleanup` \/ `update` \|.*\| N\/A/)
    expect(parity).toContain("grok-cleanup-update-doc.test.ts")
    expect(parity).toContain("grok-cleanup-update.md")
  })
})
