import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { mkdtempSync } from "node:fs"
import { describe, expect, test } from "vitest"

import {
  GitEnvPrefixSchema,
  SkillsConfigSchema,
  assertValidGitEnvPrefix,
  createBuiltinSkills,
  createInternalAgentTextPart,
  createSharedSkillTemplateLoader,
  isRealUserMessage,
  isSyntheticOrInternalUserMessage,
  isValidGitEnvPrefix,
  parseJsonc,
  resolveActiveBuiltinSkills,
  resolveSkillPathReferences,
  stripInternalInitiatorMarkers,
} from "./skills-loader-core-vendored"

describe("skills-loader-core-vendored", () => {
  test("validates git env prefixes", () => {
    expect(isValidGitEnvPrefix("")).toBe(true)
    expect(isValidGitEnvPrefix("GIT_MASTER=1 TRACE_ID=abc-123")).toBe(true)
    expect(isValidGitEnvPrefix("GIT_MASTER=$(rm -rf /)")).toBe(false)
    expect(() => assertValidGitEnvPrefix("bad key=value")).toThrow(/git_env_prefix/)
    expect(GitEnvPrefixSchema.parse(undefined)).toBe("GIT_MASTER=1")
  })

  test("parses skills config schema shapes", () => {
    expect(SkillsConfigSchema.parse(["git-master", "frontend"])).toEqual(["git-master", "frontend"])
    expect(
      SkillsConfigSchema.parse({
        sources: [{ path: "./skills", recursive: true, glob: "**/*.md" }],
        enable: ["git-master"],
        disable: ["team-mode"],
        "custom-skill": {
          description: "Custom",
          template: "Body",
          metadata: { owner: "lfg" },
          "allowed-tools": ["Bash"],
        },
      })
    ).toMatchObject({
      sources: [{ path: "./skills", recursive: true, glob: "**/*.md" }],
      "custom-skill": { description: "Custom" },
    })
  })

  test("resolves path references inside a skill body", () => {
    const content = "Read @docs/guide.md and keep literal @package/name, but not x@docs/file.md."
    expect(resolveSkillPathReferences(content, "/repo/project")).toBe(
      "Read /repo/project/docs/guide.md and keep literal @package/name, but not x@docs/file.md."
    )
  })

  test("loads skill markdown from an explicit root and strips frontmatter", () => {
    const root = mkdtempSync(join(tmpdir(), "lfg-skill-loader-"))
    mkdirSync(join(root, "demo"))
    writeFileSync(join(root, "demo", "SKILL.md"), "---\nname: demo\n---\n# Demo\nBody\n")

    const loader = createSharedSkillTemplateLoader(undefined, root)
    expect(loader("demo")).toBe("# Demo\nBody\n")
  })

  test("selects and filters builtin skill metadata", () => {
    const skills = createBuiltinSkills({ browserProvider: "playwright-cli", teamModeEnabled: true })
    expect(skills.map((skill) => skill.name)).toContain("team-mode")
    expect(skills.find((skill) => skill.name === "playwright")?.mcpConfig).toBeUndefined()

    const withoutSystemPlaywright = resolveActiveBuiltinSkills({
      browserProvider: "playwright",
      systemMcpNames: new Set(["playwright"]),
    })
    expect(withoutSystemPlaywright.some((skill) => skill.name === "playwright")).toBe(false)

    const withoutDisabled = createBuiltinSkills({ disabledSkills: new Set(["git-master"]) })
    expect(withoutDisabled.some((skill) => skill.name === "git-master")).toBe(false)
  })

  test("handles internal initiator markers with host-neutral message shapes", () => {
    const internalPart = createInternalAgentTextPart("continue")
    const internalMessage = { role: "user", parts: [internalPart] }
    const realMessage = { role: "user", parts: [{ type: "text", text: "hello" }] }

    expect(isSyntheticOrInternalUserMessage(internalMessage)).toBe(true)
    expect(isRealUserMessage(realMessage)).toBe(true)
    expect(stripInternalInitiatorMarkers(internalPart.text)).toBe("continue")
  })

  test("parses jsonc without depending on upstream utils", () => {
    expect(parseJsonc<{ value: number }>("{\n  // comment\n  \"value\": 1\n}")).toEqual({ value: 1 })
  })
})
