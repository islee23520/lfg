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
} from "./index"
import type {
  AvailableAgent,
  AvailableCategory,
  AvailableSkill,
  CuratedBuiltinAgentName,
} from "./index"
import { AGENT_MODEL_REQUIREMENTS } from "../model-core"

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

function categoryNames(prompt: string): readonly string[] {
  const names = Array.from(
    prompt.matchAll(/^- `(?<name>[a-z][a-z-]*)` - .+$/gm),
    (match) => match.groups?.name ?? "",
  )
  return Array.from(new Set(names))
}

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

describe("agent-builder builtin registry", () => {
  test("contains curated entries for all Phase 4.3 builtin agent names", () => {
    expect([...BUILTIN_AGENT_NAMES].sort()).toEqual([...expectedBuiltinAgentNames].sort())
    expect([...Object.keys(BUILTIN_AGENTS)].sort()).toEqual([...expectedBuiltinAgentNames].sort())
  })

  test("each builtin entry has valid portable model, category, and metadata fields", () => {
    for (const name of expectedBuiltinAgentNames) {
      const definition = BUILTIN_AGENTS[name]

      expect(definition.id).toBe(name)
      expect(definition.description.trim()).not.toBe("")
      expect(definition.modelRequirementKey).toBe(name)
      expect(AGENT_MODEL_REQUIREMENTS[definition.modelRequirementKey]).toBeDefined()
      expect(["exploration", "specialist", "advisor", "utility"]).toContain(definition.category)
      expect(definition.metadata.category).toBe(definition.category)
      expect(definition.promptSections).not.toEqual([])
      expect(["full", "deferred"]).toContain(definition.portStatus)

      if (definition.portStatus === "deferred") {
        expect(definition.deferredReason?.trim()).not.toBe("")
      }
    }
  })

  test("fully ported agents project prompt sections, tool choices, categories, and skills", () => {
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

    const promptSections = [
      buildAgentIdentitySection(
        "Atlas",
        "Master Orchestrator agent from OhMyOpenCode that coordinates specialized agents to complete todo lists",
      ),
      buildKeyTriggersSection(agents, skills),
      buildToolSelectionTable(agents, tools, skills),
      buildExploreSection(agents),
      buildCategorySkillsDelegationGuide(categories, skills),
      buildDelegationTable(agents),
    ]
    const prompt = promptSections.join("\n\n")
    const lines = promptLines(prompt)

    expect(fullyPortedNames).toEqual([
      "librarian",
      "explore",
      "multimodal-looker",
      "momus",
      "atlas",
    ])
    expect(promptSections.every((section) => section.trim() !== "")).toBe(true)
    expect(prompt).toMatch(/<agent-identity>[\s\S]+Atlas[\s\S]+<\/agent-identity>/)
    expect(categoryNames(prompt)).toEqual(["deep", "visual-engineering"])

    requireLineMatching(lines, /`grep`, `glob`, `lsp_\*`.+\*\*FREE\*\*/)
    requireLineMatching(lines, /`explore` agent.+\*\*FREE\*\*/)
    requireLineMatching(lines, /`librarian` agent.+\*\*CHEAP\*\*/)
    requireLineMatching(lines, /`atlas` agent.+\*\*EXPENSIVE\*\*/)
    requireLineMatching(lines, /Built-in.+\blfg\b/)
    requireLineMatching(lines, /YOUR SKILLS.+ast-grep \(user\)/)
    requireLineMatching(lines, /Todo list orchestration.+`atlas`/)
    requireLineMatching(lines, /Librarian.+`librarian`/)
  })
})
