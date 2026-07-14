/**
 * Host-neutral difficulty-tier routing for upstream lazycodex-worker-low|medium|high.
 * Pure resolver: maps spawn/task metadata → tier + subagent_type with availability-aware fallbacks.
 * Does not claim host-enforced dispatch or Codex mailbox behavior.
 */

export type DifficultyTier = "low" | "medium" | "high"

export type DifficultyTierRoute = {
  readonly tier: DifficultyTier
  /** Canonical upstream worker name for this tier (always the default worker id). */
  readonly upstreamAgentType: string
  /** Selected Grok/OMO subagent_type after override + availability resolution. */
  readonly subagentType: string
  /** Short guidance for orchestrators / prompts. */
  readonly guidance: string
}

export type DifficultyTierRouteOptions = {
  /** Per-tier subagent_type overrides; applied only when present in availableSubagentTypes (or when availability is unrestricted). */
  readonly overrides?: Readonly<Partial<Record<DifficultyTier, string>>>
  /** When set, only listed types may be selected; missing default workers fall through to tier fallbacks. */
  readonly availableSubagentTypes?: readonly string[]
}

const DEFAULT_WORKER_BY_TIER: Readonly<Record<DifficultyTier, string>> = {
  low: "lazycodex-worker-low",
  medium: "lazycodex-worker-medium",
  high: "lazycodex-worker-high",
}

/** Grok category personas used when the tier's default worker is not available. */
const TIER_FALLBACK_SUBAGENT: Readonly<Record<DifficultyTier, string>> = {
  low: "quick",
  medium: "coding",
  high: "unspecified-high",
}

export function resolveDifficultyTierRoute(
  metadata: unknown,
  options: DifficultyTierRouteOptions = {},
): DifficultyTierRoute {
  const tier = parseDifficultyTier(metadata)
  const upstreamAgentType = DEFAULT_WORKER_BY_TIER[tier]
  const available = options.availableSubagentTypes
  const isAvailable = (name: string): boolean =>
    available === undefined ? true : available.includes(name)

  const override = options.overrides?.[tier]
  if (typeof override === "string" && override.length > 0 && isAvailable(override)) {
    return {
      tier,
      upstreamAgentType,
      subagentType: override,
      guidance: guidanceFor(tier, override, "override"),
    }
  }

  if (isAvailable(upstreamAgentType)) {
    return {
      tier,
      upstreamAgentType,
      subagentType: upstreamAgentType,
      guidance: guidanceFor(tier, upstreamAgentType, "default"),
    }
  }

  const fallback = TIER_FALLBACK_SUBAGENT[tier]
  return {
    tier,
    upstreamAgentType,
    subagentType: fallback,
    guidance: guidanceFor(tier, fallback, "fallback"),
  }
}

function parseDifficultyTier(metadata: unknown): DifficultyTier {
  if (!isPlainObject(metadata)) return "medium"

  const direct = normalizeTierValue(metadata.difficulty)
  if (direct !== undefined) return direct

  const task = metadata.task
  if (isPlainObject(task)) {
    const nested = normalizeTierValue(task.difficulty)
    if (nested !== undefined) return nested
  }

  const nestedMeta = metadata.metadata
  if (isPlainObject(nestedMeta)) {
    const nested = normalizeTierValue(nestedMeta.difficulty)
    if (nested !== undefined) return nested
  }

  const agentType =
    typeof metadata.agent_type === "string"
      ? metadata.agent_type
      : typeof metadata.agentType === "string"
        ? metadata.agentType
        : undefined
  if (agentType !== undefined) {
    const fromWorker = tierFromWorkerName(agentType)
    if (fromWorker !== undefined) return fromWorker
  }

  return "medium"
}

function normalizeTierValue(value: unknown): DifficultyTier | undefined {
  if (typeof value !== "string") return undefined
  switch (value.trim().toLowerCase()) {
    case "low":
      return "low"
    case "medium":
      return "medium"
    case "high":
      return "high"
    default:
      return undefined
  }
}

function tierFromWorkerName(agentType: string): DifficultyTier | undefined {
  switch (agentType) {
    case "lazycodex-worker-low":
      return "low"
    case "lazycodex-worker-medium":
      return "medium"
    case "lazycodex-worker-high":
      return "high"
    default:
      return undefined
  }
}

function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function guidanceFor(
  tier: DifficultyTier,
  subagentType: string,
  kind: "default" | "override" | "fallback",
): string {
  if (kind === "fallback") {
    return (
      `Difficulty tier ${tier}: default worker unavailable; ` +
      `using fallback subagent_type "${subagentType}" ` +
      `(low→quick, medium→coding, high→unspecified-high). ` +
      `Host-neutral routing only — not host-enforced dispatch.`
    )
  }
  if (kind === "override") {
    return (
      `Difficulty tier ${tier}: using configured override subagent_type "${subagentType}" ` +
      `(upstream worker ${DEFAULT_WORKER_BY_TIER[tier]}). ` +
      `Host-neutral routing only — not host-enforced dispatch.`
    )
  }
  return (
    `Difficulty tier ${tier}: route to implementation worker "${subagentType}". ` +
    `Host-neutral routing only — not host-enforced dispatch or Codex mailbox.`
  )
}
