import { readFile } from "node:fs/promises"
import { join } from "node:path"

export async function computeSkillWorkflows(pluginRoot: string): Promise<Record<string, boolean>> {
  const planContent = await readSkillFiles(pluginRoot, "ulw-plan", [
    "SKILL.md",
    "references/full-workflow.md",
    "references/intent-clear.md",
    "references/intent-unclear.md",
    "scripts/scaffold-plan.mjs",
  ])
  const loopContent = await readSkillFiles(pluginRoot, "ulw-loop", ["SKILL.md", "references/full-workflow.md"])
  const startWorkContent = await readSkillFiles(pluginRoot, "start-work", ["SKILL.md"])

  return {
    "ulw-plan": /You are \*\*Prometheus\*\*/i.test(planContent) &&
      /Approval gate/i.test(planContent) &&
      /Phase 3/i.test(planContent) &&
      /scaffold-plan\.mjs/i.test(planContent),
    "ulw-loop": /Bootstrap/i.test(loopContent) &&
      /Execution Loop/i.test(loopContent) &&
      /Manual-QA channels|Manual QA/i.test(loopContent),
    "start-work": /Codex Harness Tool Compatibility/i.test(startWorkContent) &&
      /ABSOLUTE RULE: YOU ARE AN ORCHESTRATOR/i.test(startWorkContent) &&
      /Boulder state/i.test(startWorkContent),
  }
}

async function readSkillFiles(pluginRoot: string, skill: string, files: readonly string[]): Promise<string> {
  const contents = await Promise.all(
    files.map(async (file) => {
      try {
        return await readFile(join(pluginRoot, "skills", skill, file), "utf8")
      } catch {
        return ""
      }
    }),
  )
  return contents.join("\n")
}
