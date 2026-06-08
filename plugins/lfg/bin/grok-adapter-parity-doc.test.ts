import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const ROOT = fileURLToPath(new URL("../../..", import.meta.url))

describe("docs/grok-adapter-parity.md (plan task 1)", () => {
  test("parity table has at least 10 capability rows", async () => {
    const text = await readFile(join(ROOT, "docs/grok-adapter-parity.md"), "utf8")
    const rows = text.split("\n").filter((line) => line.startsWith("|") && !line.includes("---") && !line.includes("omo-codex capability"))
    expect(rows.length).toBeGreaterThanOrEqual(10)
    expect(text).toContain("plugins/lfg/grok-install/")
    expect(text).toContain("lfg doctor")
    expect(text).toContain("publishGap")
    expect(text).toContain("#22")
    expect(text).toContain("publish-owner-checklist")
    expect(text).toContain("plugin-cache-install.acceptance.test.ts")
    expect(text).toContain("#27")
    expect(text).toContain("doctor-json-contract.test.ts")
    expect(text).toContain("#31")
    expect(text).toContain("hook-trust.acceptance.test.ts")
    expect(text).toContain("#28")
    expect(text).toContain("config-single-writer.acceptance.test.ts")
    expect(text).toContain("agent-tomls.acceptance.test.ts")
    expect(text).toContain("publish-owner-checklist")
  })
})