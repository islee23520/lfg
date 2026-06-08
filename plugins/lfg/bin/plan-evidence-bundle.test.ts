import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const ROOT = fileURLToPath(new URL("../../..", import.meta.url))
const BUNDLE = join(ROOT, ".omo/plan-evidence/lfg-omo-grok-adapter.json")

describe(".omo/plan-evidence/lfg-omo-grok-adapter.json (#35)", () => {
  test("bundle references canonical plan and epic without secrets", async () => {
    const raw = await readFile(BUNDLE, "utf8")
    expect(raw).not.toMatch(/sk-[a-zA-Z0-9]{10,}/)
    expect(raw).not.toContain("api_key")
    const bundle = JSON.parse(raw) as {
      planPath?: string
      epicIssue?: number
      evidence?: readonly string[]
      commands?: Record<string, string>
    }
    expect(bundle.planPath).toBe("plans/lfg-omo-grok-adapter.md")
    expect(bundle.epicIssue).toBe(26)
    expect(Array.isArray(bundle.evidence)).toBe(true)
    expect(bundle.evidence!.length).toBeGreaterThan(0)
    expect(bundle.evidence!.every((p) => p.startsWith(".omo/"))).toBe(true)
    const git = (bundle as { git?: { mainHead?: string } }).git
    expect(git?.mainHead).toMatch(/^[0-9a-f]{7,40}$/)
    expect(String((bundle as { openForPublish?: string }).openForPublish)).toContain("#22")
    expect(String((bundle as { openForPublish?: string }).openForPublish)).toContain("0.1.4")
  })
})