import { describe, expect, test } from "vitest"

import {
  BUILTIN_AGENTS,
  categorizeTools,
  type AvailableAgent,
  type AvailableCategory,
  type AvailableSkill,
  type CuratedBuiltinAgentName,
} from "./agent-builder-vendored"
import { buildGrokAgentRole } from "./grok-agent-builder-adapter"
import { buildGrokModelCatalog } from "./grok-model-adapter"

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
    expect(role.systemPrompt.length).toBeGreaterThan(1500)
    expect(role.systemPrompt).toContain("<agent-identity>")
    expect(role.systemPrompt).toContain("### Tool & Agent Selection:")
    expect(role.systemPrompt).toContain("### Category + Skills Delegation System")
    expect(role.systemPrompt).toContain("`explore` agent")
    expect(role.systemPrompt).toContain("frontend (project)")
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
    expect(promptWithoutRuntimeSurface).not.toContain("`grep`, `lsp_*`")
    expect(promptWithRuntimeSurface).toContain("`grep`, `lsp_*`")
    expect(promptWithoutRuntimeSurface).not.toContain("frontend (project)")
    expect(promptWithRuntimeSurface).toContain("frontend (project)")
  })
})
