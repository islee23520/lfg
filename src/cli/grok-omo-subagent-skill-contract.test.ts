import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { describe, expect, test } from "vitest"

const repoRoot = join(import.meta.dirname, "..", "..")

const orchestrationSkills = [
  "ultraresearch",
  "ulw-loop",
  "refactor",
  "start-work",
  "ulw-plan",
  "init-deep",
  "review-work",
  "remove-ai-slops",
] as const

describe("grok-omo-subagent skill contract", () => {
  for (const skillName of orchestrationSkills) {
    test(`${skillName} documents GrokBuild spawn_subagent mapping preferring host explore`, async () => {
      const text = await readFile(join(repoRoot, "skills", skillName, "SKILL.md"), "utf8")
      expect(text).toMatch(/GrokBuild (Harness )?Tool (Compatibility|Mapping)/)
      expect(text).toContain("spawn_subagent")
      expect(text).toContain('subagent_type: "explore"')
      expect(text).toContain("coding_tool_adapter")
      expect(text).toMatch(/Prefer host built-ins|host built-in/i)
      expect(text).not.toMatch(/do not use disabled Grok built-ins/)
    })
  }
})
