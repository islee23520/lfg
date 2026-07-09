import { describe, expect, test } from "vitest"

import {
  BUILTIN_AGENTS,
  categorizeTools,
  type AvailableAgent,
  type AvailableCategory,
  type AvailableSkill,
  type CuratedBuiltinAgentName,
} from "../../core/omo/agent-builder"
import { buildGrokAgentRole } from "./grok-agent-builder-adapter"
import { buildGrokModelCatalog } from "../models/grok-model-adapter"

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

const categories: AvailableCategory[] = [
  { name: "deep", description: "Autonomous research and implementation", model: "xai/grok-4" },
  { name: "visual-engineering", description: "Frontend and multimodal UI work" },
]

const pluginSkill: AvailableSkill = {
  name: "lfg",
  description: "GrokBuild adapter operations",
  location: "plugin",
}

const projectSkill: AvailableSkill = {
  name: "frontend",
  description: "Project frontend patterns",
  location: "project",
}

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

describe("buildGrokAgentRole", () => {
  test("assembles a fully ported builtin agent role with prompt, model, and tool restrictions", () => {
    const catalog = buildGrokModelCatalog({ modelIds: ["grok-4", "grok-3-mini"] })
    const role = buildGrokAgentRole({
      agentName: "atlas",
      catalog,
      availableAgents: asAvailableAgents(["explore", "librarian", "atlas"]),
      availableTools: categorizeTools(["grep", "glob", "lsp_symbols", "skill"]),
      availableSkills: [pluginSkill, projectSkill],
      availableCategories: categories,
    })

    expect(role.name).toBe("atlas")
    expect(role.model).toBe("xai/grok-4")
    expect(role.toolRestrictions).toEqual(BUILTIN_AGENTS.atlas.toolRestrictions)
    expect(role.systemPrompt).toMatch(/<agent-identity>[\s\S]+Atlas[\s\S]+<\/agent-identity>/)
    expect(categoryNames(role.systemPrompt)).toEqual(["deep", "visual-engineering"])

    const lines = promptLines(role.systemPrompt)
    requireLineMatching(lines, /`grep`, `glob`, `lsp_\*`.+\*\*FREE\*\*/)
    requireLineMatching(lines, /`explore` agent.+\*\*FREE\*\*/)
    requireLineMatching(lines, /`librarian` agent.+\*\*CHEAP\*\*/)
    requireLineMatching(lines, /`atlas` agent.+\*\*EXPENSIVE\*\*/)
    requireLineMatching(lines, /Built-in.+\blfg\b/)
    requireLineMatching(lines, /YOUR SKILLS.+frontend \(project\)/)
    requireLineMatching(lines, /Todo list orchestration.+`atlas`/)
  })

  test("throws a clear deferred signal for deferred builtin agents", () => {
    const catalog = buildGrokModelCatalog({ modelIds: ["grok-4"] })

    expect(() => buildGrokAgentRole({ agentName: "sisyphus", catalog })).toThrow(
      /Agent "sisyphus" is deferred: Full Sisyphus config needs host-bound prompt builders/,
    )
  })

  test("changes the system prompt when runtime tools and skills differ", () => {
    const catalog = buildGrokModelCatalog({ modelIds: ["grok-4"] })
    const baseInput = {
      agentName: "atlas" as const,
      catalog,
      availableAgents: asAvailableAgents(["explore", "atlas"]),
      availableCategories: categories,
    }

    const promptWithoutRuntimeSurface = buildGrokAgentRole({
      ...baseInput,
      availableTools: [],
      availableSkills: [],
    }).systemPrompt
    const promptWithRuntimeSurface = buildGrokAgentRole({
      ...baseInput,
      availableTools: categorizeTools(["grep", "lsp_find_references", "skill"]),
      availableSkills: [projectSkill],
    }).systemPrompt

    expect(promptWithRuntimeSurface).not.toBe(promptWithoutRuntimeSurface)
    expect(promptWithoutRuntimeSurface).not.toMatch(/`grep`, `lsp_\*`/)
    expect(promptWithRuntimeSurface).toMatch(/`grep`, `lsp_\*`.+\*\*FREE\*\*/)
    expect(promptWithoutRuntimeSurface).not.toMatch(/frontend \(project\)/)
    requireLineMatching(promptLines(promptWithRuntimeSurface), /YOUR SKILLS.+frontend \(project\)/)
  })
})
