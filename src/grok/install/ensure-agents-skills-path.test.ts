import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, test } from "vitest"

import {
  AGENTS_SKILLS_PATH_ENTRY,
  ensureAgentsSkillsPath,
  mergeUniquePathEntries,
  parseSkillsPaths,
} from "./ensure-agents-skills-path"

const homes: string[] = []

afterEach(async () => {
  for (const home of homes) {
    await rm(home, { recursive: true, force: true })
  }
  homes.length = 0
})

async function makeHome(): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), "lfg-agents-skills-path-"))
  homes.push(home)
  await mkdir(join(home, ".grok"), { recursive: true })
  return home
}

describe("ensureAgentsSkillsPath", () => {
  test("creates [skills].paths with ~/.agents/skills when missing", async () => {
    const home = await makeHome()
    await writeFile(join(home, ".grok", "config.toml"), '[plugins]\nenabled = ["lfg"]\n', "utf8")

    const result = await ensureAgentsSkillsPath(home)
    expect(result.changed).toBe(true)
    expect(result.paths).toEqual([AGENTS_SKILLS_PATH_ENTRY])

    const toml = await readFile(join(home, ".grok", "config.toml"), "utf8")
    expect(toml).toContain("[skills]")
    expect(toml).toContain(AGENTS_SKILLS_PATH_ENTRY)
    expect(parseSkillsPaths(toml)).toEqual([AGENTS_SKILLS_PATH_ENTRY])
  })

  test("merges without dropping existing paths and is idempotent", async () => {
    const home = await makeHome()
    await writeFile(
      join(home, ".grok", "config.toml"),
      ['[skills]', 'paths = [', '    "~/team-skills",', "]", ""].join("\n"),
      "utf8",
    )

    const first = await ensureAgentsSkillsPath(home)
    expect(first.changed).toBe(true)
    expect(first.paths).toEqual(["~/team-skills", AGENTS_SKILLS_PATH_ENTRY])

    const second = await ensureAgentsSkillsPath(home)
    expect(second.changed).toBe(false)
    expect(second.paths).toEqual(["~/team-skills", AGENTS_SKILLS_PATH_ENTRY])
  })

  test("does not re-add when already present under equivalent form", async () => {
    const home = await makeHome()
    await writeFile(
      join(home, ".grok", "config.toml"),
      `[skills]\npaths = ["${AGENTS_SKILLS_PATH_ENTRY}"]\n`,
      "utf8",
    )
    const result = await ensureAgentsSkillsPath(home)
    expect(result.changed).toBe(false)
  })
})

describe("mergeUniquePathEntries", () => {
  test("drops trailing-slash and case-equivalent path duplicates", () => {
    expect(mergeUniquePathEntries(["~/.agents/skills/"], ["~/.agents/skills", "~/.Agents/Skills"])).toEqual([
      "~/.agents/skills/",
    ])
  })
})
