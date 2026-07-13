import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { ensureLfgNativeSkills, LFG_NATIVE_SKILLS } from "./ensure-cua-driver-skill"

describe("ensureLfgNativeSkills", () => {
  test("installs claude-code-inventory into plugin skills on setup path", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-native-skills-"))
    const pluginRoot = join(home, ".grok", "plugins", "lfg")
    await mkdir(join(pluginRoot, "skills"), { recursive: true })

    const result = await ensureLfgNativeSkills(pluginRoot)
    expect(LFG_NATIVE_SKILLS).toContain("claude-code-inventory")
    expect(result.ensured).toBe(true)
    expect(result.paths.some((p) => p.includes("claude-code-inventory"))).toBe(true)

    const skillMd = join(pluginRoot, "skills", "claude-code-inventory", "SKILL.md")
    await access(skillMd)
    const body = await readFile(skillMd, "utf8")
    expect(body).toMatch(/lfg claude/i)
    expect(body).toMatch(/Claude Code/i)

    const grokYaml = join(pluginRoot, "skills", "claude-code-inventory", "agents", "grok.yaml")
    await access(grokYaml)
  })

  test("refreshes a stale stub skill on re-ensure", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-native-skills-stale-"))
    const pluginRoot = join(home, ".grok", "plugins", "lfg")
    const skillDir = join(pluginRoot, "skills", "claude-code-inventory")
    await mkdir(skillDir, { recursive: true })
    await writeFile(join(skillDir, "SKILL.md"), "# stub\n", "utf8")

    const result = await ensureLfgNativeSkills(pluginRoot)
    expect(result.ensured).toBe(true)
    const body = await readFile(join(skillDir, "SKILL.md"), "utf8")
    expect(body.length).toBeGreaterThan(200)
    expect(body).toMatch(/inventory/i)
  })
})
