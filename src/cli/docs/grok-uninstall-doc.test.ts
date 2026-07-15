import { readFile } from "node:fs/promises"
import { describe, expect, test } from "vitest"

describe("grok uninstall documentation", () => {
  test("documents confirmation and ownership boundaries", async () => {
    const doc = await readFile(new URL("../../../docs/grok-uninstall.md", import.meta.url), "utf8")
    expect(doc).toContain("lfg --json uninstall")
    expect(doc).toContain("--yes")
    expect(doc).toContain("auth")
    expect(doc).toContain("~/.grok")
  })
})
