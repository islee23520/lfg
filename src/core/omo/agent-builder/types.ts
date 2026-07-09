import type { ModelVariant } from "../prompts-core"
import {
  isClaudeFable5Model,
  isClaudeOpus46Model,
  isClaudeOpus47Model,
  isClaudeOpus47OrLaterModel,
  isClaudeOpus48Model,
  isGeminiModel,
  isGlmModel,
  isGptModel,
  isKimiK2Model,
  isKimiK27Model,
  isMiniMaxModel,
} from "../model-core"

export {
  isClaudeFable5Model,
  isClaudeOpus46Model,
  isClaudeOpus47Model,
  isClaudeOpus47OrLaterModel,
  isClaudeOpus48Model,
  isGeminiModel,
  isGlmModel,
  isGptModel,
  isKimiK2Model,
  isKimiK27Model,
  isMiniMaxModel,
}

/**
 * Grok-neutral port of the upstream OmO agent type surface.
 *
 * This keeps only the prompt-assembly and model-routing fields used by the
 * upstream builders. OpenCode host plumbing such as SDK lifecycle callbacks,
 * tool registration hooks, and permission adapters is intentionally omitted.
 */
export type AgentConfig = {
  readonly description?: string
  model?: string
  temperature?: number
  variant?: ModelVariant | string
  mode?: AgentMode
  category?: string
  skills?: readonly string[]
  prompt?: string
  prompt_append?: string
  reasoningEffort?: ReasoningEffort
  textVerbosity?: TextVerbosity
  thinking?: ThinkingConfig
}

export type ThinkingConfig = {
  readonly type: "enabled" | "disabled"
  readonly budgetTokens?: number
}

export type ReasoningEffort =
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max"

export type TextVerbosity = "low" | "medium" | "high"

const CLAUDE_THINKING_BUDGET_TOKENS = 32000

/**
 * Anthropic Opus 4.7+ rejects thinking.type "enabled"; it requires adaptive
 * thinking plus an effort, which host cores derive from the model variant.
 * For those models emit no thinking config. All other Claude models keep the
 * explicit enabled-thinking budget.
 */
export function buildClaudeThinkingConfig(
  model: string,
): { thinking: { type: "enabled"; budgetTokens: number } } | Record<string, never> {
  if (isClaudeOpus47OrLaterModel(model)) {
    return {}
  }
  return { thinking: { type: "enabled", budgetTokens: CLAUDE_THINKING_BUDGET_TOKENS } }
}

/**
 * Agent mode determines UI model selection behavior:
 * - "primary": Respects user's UI-selected model (sisyphus, atlas)
 * - "subagent": Uses own fallback chain, ignores UI selection (oracle, explore, etc.)
 * - "all": Available in both contexts (OpenCode compatibility)
 */
export type AgentMode = "primary" | "subagent" | "all"

/**
 * Agent factory function with static mode property.
 * Mode is exposed as static property for pre-instantiation access.
 */
export type AgentFactory = ((model: string) => AgentConfig) & {
  mode: AgentMode
}

/**
 * Agent category for grouping in Sisyphus prompt sections.
 */
export type AgentCategory =
  | "exploration"
  | "specialist"
  | "advisor"
  | "utility"

/**
 * Cost classification for Tool Selection table.
 */
export type AgentCost = "FREE" | "CHEAP" | "EXPENSIVE"

/**
 * Delegation trigger for Sisyphus prompt's Delegation Table.
 */
export type DelegationTrigger = {
  readonly domain: string
  readonly trigger: string
}

/**
 * Metadata for generating Sisyphus prompt sections dynamically.
 */
export type AgentPromptMetadata = {
  readonly category: AgentCategory
  readonly cost: AgentCost
  readonly triggers: readonly DelegationTrigger[]
  readonly useWhen?: readonly string[]
  readonly avoidWhen?: readonly string[]
  readonly dedicatedSection?: string
  readonly promptAlias?: string
  readonly keyTrigger?: string
}

function extractModelName(model: string): string {
  return model.includes("/") ? (model.split("/").pop() ?? model) : model
}

const GPT_NATIVE_SISYPHUS_RE = /gpt-5[.-](?:(?:3[.-])?codex|[4-9]|\d{2,})/i

export function isGptNativeSisyphusModel(model: string): boolean {
  const modelName = extractModelName(model).toLowerCase()
  return GPT_NATIVE_SISYPHUS_RE.test(modelName)
}

export function isGpt5_5Model(model: string): boolean {
  const modelName = extractModelName(model).toLowerCase()
  return modelName.includes("gpt-5.5") || modelName.includes("gpt-5-5")
}

export type BuiltinAgentName =
  | "sisyphus"
  | "hephaestus"
  | "oracle"
  | "librarian"
  | "explore"
  | "multimodal-looker"
  | "metis"
  | "momus"
  | "atlas"
  | "sisyphus-junior"

export type OverridableAgentName = "build" | BuiltinAgentName

export type AgentName = BuiltinAgentName

export type AgentOverrideConfig = Partial<AgentConfig> & {
  readonly category?: string
  readonly prompt_append?: string
  readonly skills?: readonly string[]
  readonly variant?: ModelVariant | string
  readonly fallback_models?: string | readonly (string | FallbackModelObject)[]
}

export type FallbackModelObject = {
  readonly providers?: readonly string[]
  readonly model: string
  readonly variant?: string
}

export type AgentOverrides = Partial<
  Record<OverridableAgentName, AgentOverrideConfig>
>

export type CategoryConfig = {
  readonly description?: string
  readonly model?: string
  readonly fallback_models?: string | readonly (string | FallbackModelObject)[]
  readonly variant?: ModelVariant | string
  readonly temperature?: number
  readonly top_p?: number
  readonly maxTokens?: number
  readonly thinking?: ThinkingConfig
  readonly reasoningEffort?: ReasoningEffort
  readonly textVerbosity?: TextVerbosity
  readonly tools?: Readonly<Record<string, boolean>>
  readonly prompt_append?: string
  readonly max_prompt_tokens?: number
  readonly is_unstable_agent?: boolean
  readonly disable?: boolean
}

export type CategoriesConfig = Readonly<Record<string, CategoryConfig>>
