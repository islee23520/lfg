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
} from "./agent-builder-vendored"
import type {
  AvailableAgent,
  AvailableCategory,
  AvailableSkill,
} from "./agent-builder-vendored"

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

describe("agent-builder-vendored dynamic prompt builders", () => {
  test("composes a non-empty dynamic prompt from real agents, tools, skills, and categories", () => {
    const tools = categorizeTools(["grep", "glob", "lsp_symbols", "skill"])
    const prompt = [
      buildKeyTriggersSection(availableAgents, availableSkills),
      buildToolSelectionTable(availableAgents, tools, availableSkills),
      buildExploreSection(availableAgents),
      buildCategorySkillsDelegationGuide(availableCategories, availableSkills),
      buildDelegationTable(availableAgents),
      buildHardBlocksSection(),
    ].join("\n\n")

    expect(prompt.length).toBeGreaterThan(1000)
    expect(prompt).toContain("### Key Triggers (check BEFORE classification):")
    expect(prompt).toContain("### Tool & Agent Selection:")
    expect(prompt).toContain("`grep`, `glob`, `lsp_*` - **FREE**")
    expect(prompt).toContain("### Explore Agent = Contextual Grep")
    expect(prompt).toContain("### Category + Skills Delegation System")
    expect(prompt).toContain("`visual-engineering`")
    expect(prompt).toContain("### Delegation Table:")
    expect(prompt).toContain("## Hard Blocks (NEVER violate)")
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

    expect(guide).toContain("#### Available Categories (Domain-Optimized Models)")
    expect(guide).toContain("`deep` - Autonomous research and end-to-end implementation")
    expect(guide).toContain("**Built-in**: frontend")
    expect(guide).toContain("YOUR SKILLS (PRIORITY)")
    expect(guide).toContain("react-19 (user)")
    expect(guide).toContain("`skill` tool")
    expect(guide).toContain("User-installed skills get PRIORITY")
    expect(guide).toContain("task(\n  category=\"[selected-category]\"")
  })
})
