import { describe, expect, test } from "vitest"

import {
  buildCategorySkillsDelegationGuide,
  buildDelegationTable,
  buildExploreSection,
  buildHardBlocksSection,
  buildKeyTriggersSection,
  buildToolSelectionTable,
  categorizeTools,
  getToolsPromptDisplay,
} from "./index"
import type {
  AvailableAgent,
  AvailableCategory,
  AvailableSkill,
} from "./index"

const availableAgents: AvailableAgent[] = [
  {
    name: "explore",
    description: "Search the local repository for relevant implementation patterns.",
    metadata: {
      category: "exploration",
      cost: "CHEAP",
      triggers: [
        { domain: "Codebase research", trigger: "Unknown files or APIs need discovery" },
      ],
      useWhen: ["Find all call sites", "Map an unfamiliar feature"],
      avoidWhen: ["Known single file edit", "Exact path already supplied"],
      keyTrigger: "Need repo context before implementation → use explore",
    },
  },
  {
    name: "oracle",
    description: "Read-only architecture and debugging consultant for hard decisions.",
    metadata: {
      category: "advisor",
      cost: "EXPENSIVE",
      triggers: [
        { domain: "Architecture", trigger: "High-risk design decision" },
      ],
      useWhen: ["Need architecture validation"],
      avoidWhen: ["Routine implementation"],
    },
  },
]

const availableCategories: AvailableCategory[] = [
  { name: "deep", description: "Autonomous research and end-to-end implementation" },
  { name: "visual-engineering", description: "Frontend, UI/UX, styling, and layout work" },
]

const availableSkills: AvailableSkill[] = [
  { name: "frontend", description: "Frontend and design implementation", location: "plugin" },
  { name: "react-19", description: "React 19 patterns", location: "user" },
]

function promptLines(prompt: string): readonly string[] {
  return prompt.split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== "")
}

function requireLineMatching(lines: readonly string[], pattern: RegExp): string {
  const line = lines.find((entry) => pattern.test(entry))
  if (line === undefined) {
    throw new Error(`Prompt line matching ${pattern} was not found`)
  }
  return line
}

function categoryRows(prompt: string): ReadonlyMap<string, string> {
  return new Map(
    Array.from(prompt.matchAll(/^- `(?<name>[a-z][a-z-]*)` - (?<description>.+)$/gm), (match) => [
      match.groups?.name ?? "",
      match.groups?.description ?? "",
    ]),
  )
}

describe("agent-builder dynamic prompt builders", () => {
  test("composes prompt sections from real agents, tools, skills, and categories", () => {
    const tools = categorizeTools(["grep", "glob", "lsp_symbols", "skill"])
    const sections = [
      buildKeyTriggersSection(availableAgents, availableSkills),
      buildToolSelectionTable(availableAgents, tools, availableSkills),
      buildExploreSection(availableAgents),
      buildCategorySkillsDelegationGuide(availableCategories, availableSkills),
      buildDelegationTable(availableAgents),
      buildHardBlocksSection(),
    ]
    const prompt = sections.join("\n\n")
    const lines = promptLines(prompt)

    expect(sections.every((section) => section.trim() !== "")).toBe(true)
    expect(categoryRows(prompt)).toEqual(
      new Map([
        ["deep", "Autonomous research and end-to-end implementation"],
        ["visual-engineering", "Frontend, UI/UX, styling, and layout work"],
      ]),
    )
    requireLineMatching(lines, /Need repo context before implementation.+use explore/)
    requireLineMatching(lines, /`grep`, `glob`, `lsp_\*`.+\*\*FREE\*\*/)
    requireLineMatching(lines, /`explore` agent.+\*\*CHEAP\*\*/)
    requireLineMatching(lines, /`oracle` agent.+\*\*EXPENSIVE\*\*/)
    requireLineMatching(lines, /Known single file edit/)
    requireLineMatching(lines, /Find all call sites/)
    requireLineMatching(lines, /Codebase research.+`explore`/)
    requireLineMatching(lines, /Architecture.+`oracle`/)
    requireLineMatching(lines, /as any.+Never/i)
    requireLineMatching(lines, /Commit without explicit request.+Never/i)
  })

  test("categorizeTools maps real tool names to prompt categories and display text", () => {
    const tools = categorizeTools([
      "grep",
      "glob",
      "lsp_diagnostics",
      "session_new",
      "skill",
      "todo_write",
    ])

    expect(tools).toEqual([
      { name: "grep", category: "search" },
      { name: "glob", category: "search" },
      { name: "lsp_diagnostics", category: "lsp" },
      { name: "session_new", category: "session" },
      { name: "skill", category: "command" },
      { name: "todo_write", category: "other" },
    ])
    expect(getToolsPromptDisplay(tools)).toBe("`grep`, `glob`, `lsp_*`")
  })

  test("buildCategorySkillsDelegationGuide emits category and skill guidance for real fixtures", () => {
    const guide = buildCategorySkillsDelegationGuide(availableCategories, availableSkills)
    const lines = promptLines(guide)

    expect(categoryRows(guide)).toEqual(
      new Map([
        ["deep", "Autonomous research and end-to-end implementation"],
        ["visual-engineering", "Frontend, UI/UX, styling, and layout work"],
      ]),
    )
    requireLineMatching(lines, /Built-in.+\bfrontend\b/)
    requireLineMatching(lines, /YOUR SKILLS.+react-19 \(user\)/)
    requireLineMatching(lines, /skill.+tool/i)
    requireLineMatching(lines, /User-installed skills.+PRIORITY/i)
    expect(guide).toMatch(/task\([\s\S]+category="\[selected-category\]"[\s\S]+load_skills=\[/)
    expect(guide).toMatch(/UI.+styling.+layout.+design[\s\S]+`visual-engineering`/)
  })
})
