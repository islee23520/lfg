export type SubagentModelMapping = {
  readonly default?: string
  readonly fast?: string
  readonly reasoning?: string
  readonly coding?: string
  readonly fastReasoning?: string
  readonly reasoningReasoning?: string
  readonly codingReasoning?: string
  /** Override for default/sisyphus orchestrator effort (default: low). */
  readonly defaultReasoning?: string
}

/** Host built-ins stay enabled (true): explore / general-purpose avoid duplicating OMO explorer.
 * Shadow aliases (grok-build, builder, cursor, browser-use) stay off; lfg personas stay on.
 */
export const LFG_SUBAGENT_TOGGLES: readonly (readonly [string, boolean])[] = [
  ["cursor", false],
  ["general-purpose", true],
  ["explore", true],
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
  // Orchestrator default/sisyphus: low effort is enough on Grok 4.5 frontier.
  const orchestrator = mapping.defaultReasoning ?? "low"
  return {
    ...subagentRouteEntries(REASONING_SUBAGENTS, reasoning),
    ...subagentRouteEntries(FAST_SUBAGENTS, fast),
    ...subagentRouteEntries(CODING_SUBAGENTS, coding),
    default: orchestrator,
    sisyphus: orchestrator,
  }
}

function subagentRouteEntries(names: readonly string[], value: string): Record<string, string> {
  return Object.fromEntries(names.map((name) => [name, value]))
}
