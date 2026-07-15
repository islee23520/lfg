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
 * Product implementation is external Codex app-server work, so no in-host
 * LazyCodex implementation route is installed.
 */
export const LFG_SUBAGENT_TOGGLES: readonly (readonly [string, boolean])[] = [
  ["cursor", false],
  ["general-purpose", false],
  ["explore", false],
  ["browser-use", false],
  ["grok-build", false],
  ["builder", false],
  ["sisyphus", true],
  ["watcher", true],
  ["explorer", true],
  ["git-master", true],
] as const

/** OMO communicators, planners, deep specialists, visual categories. */
const REASONING_SUBAGENTS = ["sisyphus", "watcher"] as const

/** Utility runners — speed / low-token (explorer orientation + git-master). */
const FAST_SUBAGENTS = ["explorer", "git-master"] as const

export function lfgOwnedSubagentModels(mapping: SubagentModelMapping = {}): Record<string, string> {
  const fastRoute = mapping.fast || mapping.default || "grok-3-mini-fast"
  const reasoningRoute = mapping.reasoning || "grok-4.20-0309-reasoning"
  return {
    ...subagentRouteEntries(REASONING_SUBAGENTS, reasoningRoute),
    ...subagentRouteEntries(FAST_SUBAGENTS, fastRoute),
  }
}

export function lfgOwnedSubagentReasoningEffort(mapping: SubagentModelMapping = {}): Record<string, string> {
  const fast = mapping.fastReasoning ?? "low"
  const reasoning = mapping.reasoningReasoning ?? "high"
  // Orchestrator default/sisyphus: low effort is enough on Grok 4.5 frontier.
  const orchestrator = mapping.defaultReasoning ?? "low"
  return {
    ...subagentRouteEntries(REASONING_SUBAGENTS, reasoning),
    ...subagentRouteEntries(FAST_SUBAGENTS, fast),
    sisyphus: orchestrator,
    watcher: orchestrator,
  }
}

function subagentRouteEntries(names: readonly string[], value: string): Record<string, string> {
  return Object.fromEntries(names.map((name) => [name, value]))
}
