import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { expect } from "vitest"

export async function expectUpstreamOmoWorkflowSkills(pluginRoot: string): Promise<void> {
  const skillsRoot = join(pluginRoot, "skills")
  const manifest = await readFile(join(skillsRoot, ".lfg-omo-skill-sync.json"), "utf8")
  const plan = await readFile(join(skillsRoot, "ulw-plan", "SKILL.md"), "utf8")
  const planWorkflow = await readFile(join(skillsRoot, "ulw-plan", "references", "full-workflow.md"), "utf8")
  const planScript = await readFile(join(skillsRoot, "ulw-plan", "scripts", "scaffold-plan.mjs"), "utf8")
  const loop = await readFile(join(skillsRoot, "ulw-loop", "SKILL.md"), "utf8")
  const loopWorkflow = await readFile(join(skillsRoot, "ulw-loop", "references", "full-workflow.md"), "utf8")
  const startWork = await readFile(join(skillsRoot, "start-work", "SKILL.md"), "utf8")

  expect(manifest).toContain('"managedSkills"')
  expect(manifest).toContain('"visual-qa"')
  expect(manifest).toContain('"lfg-doctor"')
  expect(manifest).not.toContain('"lcx-doctor"')
  expect(plan).toContain("You are **Prometheus**")
  expect(plan).toContain("references/full-workflow.md")
  expect(planWorkflow).toContain("## Phase 3 - Generate the plan")
  expect(planScript).toContain("scaffold-plan")
  expect(loop).toContain("This skill is intentionally compact")
  expect(loopWorkflow).toContain("## Execution Loop")
  expect(startWork).toContain("Codex Harness Tool Compatibility")
  expect(startWork).toContain("ABSOLUTE RULE: YOU ARE AN ORCHESTRATOR")
  await expect(readFile(join(skillsRoot, "rules", "SKILL.md"), "utf8")).resolves.toContain("name: rules")
  await expect(readFile(join(skillsRoot, "lsp", "SKILL.md"), "utf8")).resolves.toContain("name: lsp")
  await expect(readFile(join(skillsRoot, "comment-checker", "SKILL.md"), "utf8")).resolves.toContain("name: comment-checker")
  await expect(readFile(join(skillsRoot, "review-work", "SKILL.md"), "utf8")).resolves.toContain("name: review-work")
  await expect(readFile(join(skillsRoot, "visual-qa", "SKILL.md"), "utf8")).resolves.toContain("name: visual-qa")
  await expect(readFile(join(skillsRoot, "lfg-doctor", "SKILL.md"), "utf8")).resolves.toContain("name: lfg-doctor")
  await expect(readFile(join(skillsRoot, "lcx-doctor", "SKILL.md"), "utf8")).rejects.toThrow()
}
