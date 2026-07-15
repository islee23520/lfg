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
  const rulesSkill = await readFile(join(skillsRoot, "rules", "SKILL.md"), "utf8")
  expect(rulesSkill).toContain("name: rules")
  expect(rulesSkill).toMatch(/GrokBuild Rules|lfg Grok plugin/i)
  expect(rulesSkill).not.toContain("# Codex Rules")
  const lspSkill = await readFile(join(skillsRoot, "lsp", "SKILL.md"), "utf8")
  expect(lspSkill).toContain("name: lsp")
  expect(lspSkill).toMatch(/GrokBuild LSP/i)
  expect(lspSkill).not.toContain("# Codex LSP")
  const commentSkill = await readFile(join(skillsRoot, "comment-checker", "SKILL.md"), "utf8")
  expect(commentSkill).toContain("name: comment-checker")
  expect(commentSkill).toMatch(/GrokBuild Comment Checker/i)
  expect(commentSkill).not.toContain("# Codex Comment Checker")
  await expect(readFile(join(skillsRoot, "review-work", "SKILL.md"), "utf8")).resolves.toContain("name: review-work")
  await expect(readFile(join(skillsRoot, "visual-qa", "SKILL.md"), "utf8")).resolves.toContain("name: visual-qa")
  await expect(readFile(join(skillsRoot, "lfg-doctor", "SKILL.md"), "utf8")).resolves.toContain("name: lfg-doctor")
  await expect(readFile(join(skillsRoot, "lcx-doctor", "SKILL.md"), "utf8")).rejects.toThrow()
  await expectGrokBuildSkillActivationSurface(pluginRoot)
}

export async function expectGrokBuildSkillActivationSurface(pluginRoot: string): Promise<void> {
  const skillsRoot = join(pluginRoot, "skills")
  const planGrok = await readFile(join(skillsRoot, "ulw-plan", "agents", "grok.yaml"), "utf8")
  expect(planGrok).toMatch(/lfg --json plan ulw-plan/)
  expect(planGrok).not.toMatch(/(?<![A-Za-z0-9_/])\$ulw-plan\b/)
  await expect(readFile(join(skillsRoot, "ulw-plan", "agents", "openai.yaml"), "utf8")).rejects.toThrow()
  await expect(readFile(join(skillsRoot, "git-master", "agents", "openai.yaml"), "utf8")).rejects.toThrow()
  try {
    const cas = await readFile(join(skillsRoot, "coding-agent-sessions", "agents", "grok.yaml"), "utf8")
    expect(cas).not.toMatch(/(?<![A-Za-z0-9_/])\$coding-agent-sessions\b/)
  } catch {
    /* skill may omit agents/ in fixture installs */
  }
}
