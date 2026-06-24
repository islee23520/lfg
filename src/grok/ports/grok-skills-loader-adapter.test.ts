import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, test } from "vitest"

import { discoverGrokSkills, resolveGrokSkillPath } from "./grok-skills-loader-adapter"

let tempRoots: string[] = []

function makeTempRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix))
  tempRoots.push(root)
  return root
}

function writeSkill(skillsRoot: string, dirName: string, name: string, description: string): string {
  const skillDir = join(skillsRoot, dirName)
  mkdirSync(skillDir, { recursive: true })
  const skillPath = join(skillDir, "SKILL.md")
  writeFileSync(
    skillPath,
    [
      "---",
      `name: ${name}`,
      `description: ${description}`,
      "---",
      "",
      `# ${name}`,
      "",
      "Use this fake skill in tests only.",
      "",
    ].join("\n"),
    "utf-8",
  )
  return skillPath
}

afterEach(() => {
  for (const root of tempRoots) {
    rmSync(root, { recursive: true, force: true })
  }
  tempRoots = []
})

describe("discoverGrokSkills", () => {
  test("loads skills from explicit temp Grok roots with descriptions and scopes", () => {
    const homeSkills = join(makeTempRoot("lfg-grok-skills-home-"), "skills")
    const pluginSkills = join(makeTempRoot("lfg-grok-skills-plugin-"), "skills")
    writeSkill(homeSkills, "project-planner", "project-planner", "Plan project work")
    writeSkill(homeSkills, "code-review", "code-review", "Review code changes")
    writeSkill(pluginSkills, "ulw-plan", "ulw-plan", "Run ultrawork planning")

    const discovered = discoverGrokSkills({
      roots: [
        { path: homeSkills, scope: "user" },
        { path: pluginSkills, scope: "plugin" },
      ],
    })

    expect(discovered.map((skill) => ({ name: skill.name, description: skill.description, scope: skill.scope }))).toEqual([
      { name: "code-review", description: "Review code changes", scope: "user" },
      { name: "project-planner", description: "Plan project work", scope: "user" },
      { name: "ulw-plan", description: "Run ultrawork planning", scope: "plugin" },
    ])
    expect(discovered.every((skill) => skill.sourcePath.endsWith(join(skill.directoryName, "SKILL.md")))).toBe(true)
    expect(discovered.every((skill) => skill.template.includes("Use this fake skill in tests only."))).toBe(true)
  })
})

describe("resolveGrokSkillPath", () => {
  test("resolves a skill name to SKILL.md inside an explicit temp root", () => {
    const skillsRoot = join(makeTempRoot("lfg-grok-skill-resolve-"), "skills")
    const expectedPath = writeSkill(skillsRoot, "cua-driver", "cua-driver", "Drive browser automation")

    expect(resolveGrokSkillPath({ skillName: "cua-driver", roots: [{ path: skillsRoot, scope: "user" }] })).toEqual({
      path: expectedPath,
      scope: "user",
    })
  })
})
