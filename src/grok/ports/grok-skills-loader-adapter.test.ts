import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, test } from "vitest"

import { defaultGrokSkillRoots, discoverGrokSkills, resolveGrokSkillPath } from "./grok-skills-loader-adapter"

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

  test("includes ~/.agents/skills via default roots and drops name duplicates (higher priority wins)", () => {
    const home = makeTempRoot("lfg-skill-home-")
    const userSkills = join(home, ".grok", "skills")
    const agentsSkills = join(home, ".agents", "skills")
    const pluginSkills = join(home, ".grok", "plugins", "lfg", "skills")
    mkdirSync(userSkills, { recursive: true })
    mkdirSync(agentsSkills, { recursive: true })
    mkdirSync(pluginSkills, { recursive: true })

    writeSkill(userSkills, "only-user", "only-user", "user only")
    writeSkill(agentsSkills, "nine-router", "9router", "from agents")
    writeSkill(agentsSkills, "cua-driver", "cua-driver", "agents cua")
    writeSkill(pluginSkills, "cua-driver", "cua-driver", "plugin cua should drop")
    writeSkill(pluginSkills, "ulw-plan", "ulw-plan", "plugin only")

    const discovered = discoverGrokSkills({ home })
    const byName = Object.fromEntries(discovered.map((s) => [s.name, s]))

    expect(byName["only-user"]?.scope).toBe("user")
    expect(byName["9router"]?.scope).toBe("agents")
    expect(byName["cua-driver"]?.scope).toBe("agents")
    expect(byName["cua-driver"]?.description).toBe("agents cua")
    expect(byName["ulw-plan"]?.scope).toBe("plugin")
    // Exactly one cua-driver after dedupe
    expect(discovered.filter((s) => s.name === "cua-driver")).toHaveLength(1)
    expect(discovered.map((s) => s.name).sort()).toEqual(["9router", "cua-driver", "only-user", "ulw-plan"])
  })

  test("follows symlink skill dirs under agents root", () => {
    const home = makeTempRoot("lfg-skill-symlink-")
    const agentsSkills = join(home, ".agents", "skills")
    const realSkill = join(makeTempRoot("lfg-skill-real-"), "cua-driver")
    mkdirSync(agentsSkills, { recursive: true })
    writeSkill(join(realSkill, ".."), "cua-driver", "cua-driver", "linked cua")
    symlinkSync(join(realSkill, "..", "cua-driver"), join(agentsSkills, "cua-driver"))

    const discovered = discoverGrokSkills({
      roots: [{ path: agentsSkills, scope: "agents" }],
    })
    expect(discovered).toHaveLength(1)
    expect(discovered[0]?.name).toBe("cua-driver")
  })
})

describe("defaultGrokSkillRoots", () => {
  test("orders user → agents → plugin", () => {
    const home = "/tmp/fake-home"
    expect(defaultGrokSkillRoots(home).map((r) => r.scope)).toEqual(["user", "agents", "plugin"])
    expect(defaultGrokSkillRoots(home).map((r) => r.path)).toEqual([
      join(home, ".grok", "skills"),
      join(home, ".agents", "skills"),
      join(home, ".grok", "plugins", "lfg", "skills"),
    ])
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

  test("prefers agents root over plugin when both exist", () => {
    const home = makeTempRoot("lfg-resolve-pref-")
    const agentsSkills = join(home, ".agents", "skills")
    const pluginSkills = join(home, ".grok", "plugins", "lfg", "skills")
    mkdirSync(agentsSkills, { recursive: true })
    mkdirSync(pluginSkills, { recursive: true })
    const agentsPath = writeSkill(agentsSkills, "cua-driver", "cua-driver", "agents")
    writeSkill(pluginSkills, "cua-driver", "cua-driver", "plugin")

    expect(resolveGrokSkillPath({ skillName: "cua-driver", home })).toEqual({
      path: agentsPath,
      scope: "agents",
    })
  })
})
