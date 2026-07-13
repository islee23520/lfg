import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import {
  findClaudePlugin,
  findClaudeSkill,
  readClaudeSkillBody,
  scanClaudeCodeInventory,
} from "./index"

function fixtureHome(): { readonly root: string; readonly claudeHome: string; readonly projectRoot: string } {
  const root = mkdtempSync(join(tmpdir(), "lfg-claude-inv-"))
  const claudeHome = join(root, ".claude")
  const projectRoot = join(root, "proj")
  mkdirSync(join(claudeHome, "skills", "demo-skill"), { recursive: true })
  writeFileSync(
    join(claudeHome, "skills", "demo-skill", "SKILL.md"),
    `---\nname: demo-skill\ndescription: Demo skill for inventory tests\n---\n\n# Demo\n`,
    "utf8",
  )
  mkdirSync(join(claudeHome, "plugins", "marketplaces", "official", "plugins", "demo-plugin", ".claude-plugin"), {
    recursive: true,
  })
  writeFileSync(
    join(claudeHome, "plugins", "marketplaces", "official", "plugins", "demo-plugin", ".claude-plugin", "plugin.json"),
    JSON.stringify({
      name: "demo-plugin",
      description: "Demo plugin",
      version: "1.2.3",
      author: { name: "Test" },
      keywords: ["demo"],
    }),
    "utf8",
  )
  mkdirSync(
    join(claudeHome, "plugins", "marketplaces", "official", "plugins", "demo-plugin", "skills", "plugin-skill"),
    { recursive: true },
  )
  writeFileSync(
    join(
      claudeHome,
      "plugins",
      "marketplaces",
      "official",
      "plugins",
      "demo-plugin",
      "skills",
      "plugin-skill",
      "SKILL.md",
    ),
    `---\nname: plugin-skill\ndescription: From marketplace plugin\n---\n\nbody\n`,
    "utf8",
  )
  writeFileSync(
    join(claudeHome, "plugins", "known_marketplaces.json"),
    JSON.stringify({
      official: {
        source: { source: "github", repo: "example/official" },
        installLocation: join(claudeHome, "plugins", "marketplaces", "official"),
        lastUpdated: "2026-01-01T00:00:00.000Z",
      },
    }),
    "utf8",
  )
  writeFileSync(
    join(claudeHome, "plugins", "installed_plugins.json"),
    JSON.stringify({ version: 2, plugins: {} }),
    "utf8",
  )
  writeFileSync(
    join(claudeHome, "settings.json"),
    JSON.stringify({
      model: "claude-sonnet",
      enabledPlugins: { "demo-plugin": true },
      env: { ANTHROPIC_API_KEY: "sk-secret-must-never-leak", OTHER: "x" },
      permissions: { defaultMode: "auto" },
    }),
    "utf8",
  )
  mkdirSync(join(projectRoot, ".claude", "skills", "proj-skill"), { recursive: true })
  writeFileSync(
    join(projectRoot, ".claude", "skills", "proj-skill", "SKILL.md"),
    `---\nname: proj-skill\ndescription: Project local\n---\n\n# P\n`,
    "utf8",
  )
  mkdirSync(join(root, ".agents", "skills", "shared-skill"), { recursive: true })
  writeFileSync(
    join(root, ".agents", "skills", "shared-skill", "SKILL.md"),
    `---\nname: shared-skill\ndescription: Agents shared\n---\n\n# S\n`,
    "utf8",
  )
  return { root, claudeHome, projectRoot }
}

describe("claude-code-inventory", () => {
  test("scans user skills, project skills, agents skills, and marketplace plugins", () => {
    const fx = fixtureHome()
    const inv = scanClaudeCodeInventory({
      claudeHome: fx.claudeHome,
      homeDir: fx.root,
      projectRoot: fx.projectRoot,
      includeMarketplaceSkills: true,
    })

    expect(inv.ok).toBe(true)
    expect(inv.claudeHomeExists).toBe(true)
    expect(inv.skills.map((s) => s.name).sort()).toEqual(
      expect.arrayContaining(["demo-skill", "plugin-skill", "proj-skill", "shared-skill"]),
    )
    expect(inv.plugins.some((p) => p.name === "demo-plugin" && p.enabled)).toBe(true)
    expect(inv.marketplaces.some((m) => m.id === "official")).toBe(true)
    expect(inv.settings.model).toBe("claude-sonnet")
    expect(inv.settings.envKeys).toEqual(["ANTHROPIC_API_KEY", "OTHER"])
    // secret value must never appear in inventory object
    expect(JSON.stringify(inv)).not.toContain("sk-secret-must-never-leak")
  })

  test("find + read skill body", () => {
    const fx = fixtureHome()
    const opts = { claudeHome: fx.claudeHome, homeDir: fx.root, projectRoot: fx.projectRoot }
    const skill = findClaudeSkill("demo-skill", opts)
    expect(skill?.source).toBe("claude-user")
    const body = readClaudeSkillBody("demo-skill", opts)
    expect(body?.skillMd).toContain("# Demo")
    expect(findClaudePlugin("demo-plugin", opts)?.version).toBe("1.2.3")
  })

  test("missing claude home is fail-open empty inventory", () => {
    const inv = scanClaudeCodeInventory({
      claudeHome: join(tmpdir(), "lfg-missing-claude-home-does-not-exist"),
      includeMarketplacePlugins: false,
      includeAgentsSkills: false,
    })
    expect(inv.ok).toBe(true)
    expect(inv.claudeHomeExists).toBe(false)
    expect(inv.skillCount).toBe(0)
    expect(inv.pluginCount).toBe(0)
  })
})
