import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const ROOT = fileURLToPath(new URL("../../..", import.meta.url))
const PARITY = join(ROOT, "docs/grok-adapter-parity.md")

/** Epic #26 / plan: ≥90% parity rows Implemented or N/A (#35 gate). */
describe("grok-adapter-parity DoD (#35)", () => {
  test("at least 90% of capability rows are Implemented or N/A", async () => {
    const text = await readFile(PARITY, "utf8")
    const coreSection = text.split("## Full OMO Component Parity")[0] ?? text
    const rows = coreSection
      .split("\n")
      .filter((line) => line.startsWith("|") && !line.includes("---") && !line.includes("omo-codex capability"))
    expect(rows.length).toBeGreaterThanOrEqual(10)
    let implemented = 0
    let na = 0
    let partial = 0
    for (const row of rows) {
      const statusCell = row.split("|").at(4)?.trim() ?? ""
      if (statusCell.startsWith("Implemented")) implemented += 1
      else if (statusCell.startsWith("N/A")) na += 1
      else if (statusCell.startsWith("partial")) partial += 1
    }
    const done = implemented + na
    const ratio = done / rows.length
    expect(ratio).toBeGreaterThanOrEqual(0.9)
    expect(partial).toBeLessThanOrEqual(1)
  })
})
