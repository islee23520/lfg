export type SubagentModelMapping = {
  readonly default?: string
  readonly fast?: string
  readonly reasoning?: string
  readonly coding?: string
  readonly fastReasoning?: string
  readonly reasoningReasoning?: string
  readonly codingReasoning?: string
}

export const LFG_SUBAGENT_TOGGLES: readonly (readonly [string, boolean])[] = [
  ["cursor", false],
  ["general-purpose", false],
  ["explore", false],
  ["browser-use", false],
  ["grok-build", false],
  ["builder", false],
  ["sisyphus", true],
  ["prometheus", true],
  ["atlas", true],
  ["reasoning", true],
  ["coding", true],
  ["explorer", true],
  ["plan", true],
  ["librarian", true],
  ["metis", true],
  ["momus", true],
  ["reviewer", true],
  ["multimodal-looker", true],
  ["oracle", true],
  ["hephaestus", true],
  ["ultrabrain", true],
  ["deep", true],
  ["quick", true],
  ["unspecified-low", true],
  ["unspecified-high", true],
  ["writing", true],
  ["visual-engineering", true],
  ["visual-looker", true],
  ["artistry", true],
  ["artistry-gen", true],
  ["artistry-qa", true],
  ["ulw", true],
] as const

const REASONING_SUBAGENTS = [
  "default",
  "sisyphus",
  "hephaestus",
  "prometheus",
  "atlas",
  "oracle",
  "plan",
  "metis",
  "momus",
  "reasoning",
  "ultrabrain",
  "deep",
  "unspecified-high",
  "artistry",
  "artistry-gen",
  "artistry-qa",
  "ulw",
] as const

const FAST_SUBAGENTS = [
  "general-purpose",
  "multimodal-looker",
  "visual-engineering",
  "visual-looker",
  "explore",
  "explorer",
  "librarian",
  "quick",
  "unspecified-low",
  "writing",
] as const

const CODING_SUBAGENTS = ["coding", "grok-build", "builder", "reviewer"] as const

export function lfgOwnedSubagentModels(mapping: SubagentModelMapping = {}): Record<string, string> {
  const fastRoute = mapping.fast || mapping.default || "grok-3-mini-fast"
  const reasoningRoute = mapping.reasoning || "grok-4.20-0309-reasoning"
  const codingRoute = mapping.coding || "grok-4.20-0309-non-reasoning"
  return {
    ...subagentRouteEntries(REASONING_SUBAGENTS, reasoningRoute),
    ...subagentRouteEntries(FAST_SUBAGENTS, fastRoute),
    ...subagentRouteEntries(CODING_SUBAGENTS, codingRoute),
  }
}

export function lfgOwnedSubagentReasoningEffort(mapping: SubagentModelMapping = {}): Record<string, string> {
  const fast = mapping.fastReasoning ?? "low"
  const reasoning = mapping.reasoningReasoning ?? "high"
  const coding = mapping.codingReasoning ?? "medium"
  return {
    ...subagentRouteEntries(REASONING_SUBAGENTS, reasoning),
    ...subagentRouteEntries(FAST_SUBAGENTS, fast),
    ...subagentRouteEntries(CODING_SUBAGENTS, coding),
  }
}

function subagentRouteEntries(names: readonly string[], value: string): Record<string, string> {
  return Object.fromEntries(names.map((name) => [name, value]))
}
