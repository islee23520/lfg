import { describe, expect, test } from "vitest"

import {
  BUILTIN_AGENT_NAMES,
  BUILTIN_AGENTS,
  buildAgentIdentitySection,
  buildCategorySkillsDelegationGuide,
  buildDelegationTable,
  buildExploreSection,
  buildKeyTriggersSection,
  buildToolSelectionTable,
  categorizeTools,
} from "./agent-builder-vendored"
import type {
  AvailableAgent,
  AvailableCategory,
  AvailableSkill,
  CuratedBuiltinAgentName,
} from "./agent-builder-vendored"
import { AGENT_MODEL_REQUIREMENTS } from "./model-core-vendored"

const expectedBuiltinAgentNames = [
  "sisyphus",
  "hephaestus",
  "oracle",
  "librarian",
  "explore",
  "multimodal-looker",
  "metis",
  "momus",
  "atlas",
] satisfies readonly CuratedBuiltinAgentName[]

const categories: AvailableCategory[] = [
  { name: "deep", description: "Autonomous research and implementation" },
  { name: "visual-engineering", description: "Frontend and multimodal UI work" },
]

const skills: AvailableSkill[] = [
  { name: "lfg", description: "GrokBuild adapter operations", location: "plugin" },
  { name: "ast-grep", description: "Structural code search", location: "user" },
]

function asAvailableAgents(names: readonly CuratedBuiltinAgentName[]): AvailableAgent[] {
  return names.map((name) => {
    const definition = BUILTIN_AGENTS[name]
    return {
      name: definition.id,
      description: definition.description,
      metadata: definition.metadata,
    }
  })
}

describe("agent-builder-vendored builtin registry", () => {
  test("contains curated entries for all Phase 4.3 builtin agent names", () => {
    expect(BUILTIN_AGENT_NAMES.toSorted()).toEqual(expectedBuiltinAgentNames.toSorted())
    expect(Object.keys(BUILTIN_AGENTS).toSorted()).toEqual(expectedBuiltinAgentNames.toSorted())
  })

  test("each builtin entry has valid portable model, category, and metadata fields", () => {
    for (const name of expectedBuiltinAgentNames) {
      const definition = BUILTIN_AGENTS[name]

      expect(definition.id).toBe(name)
      expect(definition.description.trim().length).toBeGreaterThan(0)
      expect(definition.modelRequirementKey).toBe(name)
      expect(AGENT_MODEL_REQUIREMENTS[definition.modelRequirementKey]).toBeDefined()
      expect(["exploration", "specialist", "advisor", "utility"]).toContain(definition.category)
      expect(definition.metadata.category).toBe(definition.category)
      expect(definition.promptSections.length).toBeGreaterThan(0)
      expect(["full", "deferred"]).toContain(definition.portStatus)

      if (definition.portStatus === "deferred") {
        expect(definition.deferredReason?.trim().length).toBeGreaterThan(0)
      }
    }
  })

  test("fully ported agents provide prompt-builder metadata that composes non-empty dynamic prompts", () => {
    const fullyPortedNames = expectedBuiltinAgentNames.filter(
      (name) => BUILTIN_AGENTS[name].portStatus === "full",
    )
    const agents = asAvailableAgents(fullyPortedNames)
    const tools = categorizeTools([
      "grep",
      "glob",
      "lsp_symbols",
      "lsp_find_references",
      "skill",
      "web_fetch",
    ])

    const prompt = [
      buildAgentIdentitySection(
        "Atlas",
        "Master Orchestrator agent from OhMyOpenCode that coordinates specialized agents to complete todo lists",
      ),
      buildKeyTriggersSection(agents, skills),
      buildToolSelectionTable(agents, tools, skills),
      buildExploreSection(agents),
      buildCategorySkillsDelegationGuide(categories, skills),
      buildDelegationTable(agents),
    ].join("\n\n")

    expect(fullyPortedNames).toEqual([
      "librarian",
      "explore",
      "multimodal-looker",
      "momus",
      "atlas",
    ])
    expect(prompt.length).toBeGreaterThan(1500)
    expect(prompt).toContain("<agent-identity>")
    expect(prompt).toContain("### Key Triggers (check BEFORE classification):")
    expect(prompt).toContain("### Tool & Agent Selection:")
    expect(prompt).toContain("### Explore Agent = Contextual Grep")
    expect(prompt).toContain("### Category + Skills Delegation System")
    expect(prompt).toContain("### Delegation Table:")
    expect(prompt).toContain("`explore`")
    expect(prompt).toContain("`atlas`")
  })
})
