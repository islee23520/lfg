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

/**
 * Host built-ins stay enabled (true): explore / general-purpose remain available
 * while OMO spawn-map can still redirect labels to personas.
 * Shadow aliases (grok-build, builder, cursor, browser-use) stay off.
 *
 * Buckets follow OMO configuration + agent-model-matching guide roles:
 * - Communicators / planners / deep specialists → reasoning model
 * - Utility runners (explore/librarian/quick) → fast model
 * - Visual / artistry categories → reasoning (OMO: Gemini-class; Grok has no separate vision tier)
 * - Implementation workers → coding model
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
  ["lazycodex-worker-low", true],
  ["lazycodex-worker-medium", true],
  ["lazycodex-worker-high", true],
] as const

/** OMO communicators, planners, deep specialists, visual categories. */
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
  // OMO visual/artistry categories need a strong model (Gemini-class upstream).
  "visual-engineering",
  "artistry",
  "artistry-gen",
  "artistry-qa",
  "multimodal-looker",
  "ulw",
  "lazycodex-worker-high",
] as const

/** OMO utility runners: explore/librarian/quick — speed over intelligence. */
const FAST_SUBAGENTS = [
  "general-purpose",
  "explore",
  "explorer",
  "librarian",
  "quick",
  "writing",
  "lazycodex-worker-low",
] as const

/**
 * Implementation / medium workers.
 * unspecified-low is OMO's moderate-task category (GPT-class with high effort upstream);
 * on Grok it rides the coding tier rather than pure-fast utility.
 */
const CODING_SUBAGENTS = [
  "coding",
  "grok-build",
  "builder",
  "reviewer",
  "unspecified-low",
  "lazycodex-worker-medium",
] as const

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
    // OMO effort variants that differ from bucket defaults.
    prometheus: "xhigh",
    plan: "xhigh",
    momus: "xhigh",
    ultrabrain: "xhigh",
    hephaestus: "high",
    oracle: "high",
    metis: "high",
    "visual-engineering": "high",
    artistry: "high",
    "artistry-gen": "high",
    "artistry-qa": "high",
    "multimodal-looker": "medium",
    "unspecified-low": "medium",
    "unspecified-high": "high",
    // Difficulty-tier workers: effort is fixed to tier (low/medium/high).
    "lazycodex-worker-low": "low",
    "lazycodex-worker-medium": "medium",
    "lazycodex-worker-high": "high",
  }
}

function subagentRouteEntries(names: readonly string[], value: string): Record<string, string> {
  return Object.fromEntries(names.map((name) => [name, value]))
}
