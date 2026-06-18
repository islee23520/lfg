import {
  BUILTIN_AGENTS,
  buildAgentIdentitySection,
  buildCategorySkillsDelegationGuide,
  buildDelegationTable,
  buildExploreSection,
  buildKeyTriggersSection,
  buildLibrarianSection,
  buildToolSelectionTable,
  type AvailableAgent,
  type AvailableCategory,
  type AvailableSkill,
  type AvailableTool,
  type BuiltinAgentToolRestrictions,
  type CuratedBuiltinAgentName,
} from "./agent-builder-vendored"
import { resolveGrokModel, type GrokModelCatalog } from "./grok-model-adapter"
import { AGENT_MODEL_REQUIREMENTS } from "./model-core-vendored"

const DEFAULT_GROK_MODEL = "xai/grok-4"

export type GrokAgentRole = {
  readonly name: CuratedBuiltinAgentName
  readonly model: string
  readonly systemPrompt: string
  readonly toolRestrictions: BuiltinAgentToolRestrictions
}

export type BuildGrokAgentRoleInput = {
  readonly agentName: CuratedBuiltinAgentName
  readonly catalog?: GrokModelCatalog
  readonly resolvedModel?: string
  readonly availableAgents?: readonly AvailableAgent[]
  readonly availableTools?: readonly AvailableTool[]
  readonly availableSkills?: readonly AvailableSkill[]
  readonly availableCategories?: readonly AvailableCategory[]
  readonly uiSelectedModel?: string
  readonly userModel?: string
  readonly userFallbackModels?: string[]
  readonly categoryDefaultModel?: string
  readonly systemDefaultModel?: string
}

export function buildGrokAgentRole(input: BuildGrokAgentRoleInput): GrokAgentRole {
  const definition = BUILTIN_AGENTS[input.agentName]
  if (definition.portStatus === "deferred") {
    const reason = definition.deferredReason ?? "No Grok prompt adapter is available for this agent yet."
    throw new Error(`Agent "${definition.id}" is deferred: ${reason}`)
  }

  const model = input.resolvedModel ?? resolveModelForAgent(input, definition.modelRequirementKey)
  const availableAgents = [...(input.availableAgents ?? [])]
  const availableTools = [...(input.availableTools ?? [])]
  const availableSkills = [...(input.availableSkills ?? [])]
  const availableCategories = [...(input.availableCategories ?? [])]
  const systemPrompt = buildSystemPrompt({
    agentName: definition.metadata.promptAlias ?? definition.id,
    description: definition.description,
    model,
    promptSections: definition.promptSections,
    availableAgents,
    availableTools,
    availableSkills,
    availableCategories,
  })

  return {
    name: definition.id,
    model,
    systemPrompt,
    toolRestrictions: definition.toolRestrictions,
  }
}

function resolveModelForAgent(
  input: BuildGrokAgentRoleInput,
  requirementKey: CuratedBuiltinAgentName,
): string {
  if (input.catalog === undefined) {
    return input.systemDefaultModel ?? DEFAULT_GROK_MODEL
  }

  const result = resolveGrokModel({
    catalog: input.catalog,
    requirementKey,
    requirements: AGENT_MODEL_REQUIREMENTS,
    uiSelectedModel: input.uiSelectedModel,
    userModel: input.userModel,
    userFallbackModels: input.userFallbackModels,
    categoryDefaultModel: input.categoryDefaultModel,
    systemDefaultModel: input.systemDefaultModel ?? DEFAULT_GROK_MODEL,
  })

  return result.resolved?.model ?? input.systemDefaultModel ?? DEFAULT_GROK_MODEL
}

type BuildSystemPromptInput = {
  readonly agentName: string
  readonly description: string
  readonly model: string
  readonly promptSections: readonly string[]
  readonly availableAgents: readonly AvailableAgent[]
  readonly availableTools: readonly AvailableTool[]
  readonly availableSkills: readonly AvailableSkill[]
  readonly availableCategories: readonly AvailableCategory[]
}

function buildSystemPrompt(input: BuildSystemPromptInput): string {
  const sections = input.promptSections.flatMap((section) => {
    const rendered = renderPromptSection(section, input)
    return rendered.trim().length > 0 ? [rendered] : []
  })

  if (sections.length === 0) {
    return buildAgentIdentitySection(input.agentName, input.description)
  }

  return sections.join("\n\n")
}

function renderPromptSection(section: string, input: BuildSystemPromptInput): string {
  switch (section) {
    case "agent-identity":
    case "identity":
      return buildAgentIdentitySection(input.agentName, input.description)
    case "category-section":
      return buildKeyTriggersSection([...input.availableAgents], [...input.availableSkills])
    case "agent-selection-section":
    case "tool-strategy":
    case "tool-reference":
      return buildToolSelectionTable(
        [...input.availableAgents],
        [...input.availableTools],
        [...input.availableSkills],
      )
    case "decision-matrix":
      return joinNonEmpty([
        buildExploreSection([...input.availableAgents]),
        buildLibrarianSection([...input.availableAgents]),
        buildDelegationTable([...input.availableAgents]),
      ])
    case "skills-section":
    case "category-skills-delegation-guide":
      return buildCategorySkillsDelegationGuide(
        [...input.availableCategories],
        [...input.availableSkills],
      )
    case "parallel-execution":
      return buildDelegationTable([...input.availableAgents])
    case "mission":
      return `## Mission\n\n${input.description}`
    case "structured-results":
      return "## Structured Results\n\nReturn concise findings with file paths, evidence, and remaining uncertainty."
    case "intent-analysis":
      return "## Intent Analysis\n\nClassify the request before acting, then choose the lowest-cost tool or agent that can answer it."
    case "attachment-analysis":
    case "media-use-cases":
    case "document-image-diagram-guidance":
    case "response-rules":
    case "request-classification":
    case "documentation-discovery":
    case "evidence-synthesis":
    case "failure-recovery":
    case "input-validation":
    case "plan-reread-rule":
    case "reference-verification":
    case "executability-check":
    case "qa-scenario-executability":
    case "verdict-format":
      return `## ${titleize(section)}\n\nFollow the ${section} guidance for ${input.agentName} using model ${input.model}.`
    default:
      return `## ${titleize(section)}\n\nApply this ${input.agentName} prompt section using the provided runtime context.`
  }
}

function joinNonEmpty(parts: readonly string[]): string {
  return parts.filter((part) => part.trim().length > 0).join("\n\n")
}

function titleize(value: string): string {
  return value
    .split("-")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ")
}
