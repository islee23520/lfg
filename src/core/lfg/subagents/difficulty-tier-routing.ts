export type DifficultyTier = "low" | "medium" | "high"

export type DifficultyTierRoute = {
  readonly tier: DifficultyTier
  readonly legacyAgentType: string
  readonly implementationTransport: "external-codex-app-server"
  readonly handoffCommand: "lfg --json handoff plan --role coding --engine gpt"
  readonly guidance: string
}

const LEGACY_WORKER_BY_TIER: Readonly<Record<DifficultyTier, string>> = {
  low: "lazycodex-worker-low",
  medium: "lazycodex-worker-medium",
  high: "lazycodex-worker-high",
}

export function resolveDifficultyTierRoute(metadata: unknown): DifficultyTierRoute {
  const tier = parseDifficultyTier(metadata)
  return {
    tier,
    legacyAgentType: LEGACY_WORKER_BY_TIER[tier],
    implementationTransport: "external-codex-app-server",
    handoffCommand: "lfg --json handoff plan --role coding --engine gpt",
    guidance:
      `Difficulty tier ${tier}: size the external Codex work package accordingly. ` +
      "Create or attach the project app-server thread; use codex exec only when the daemon is unavailable.",
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
  return agentType === undefined ? "medium" : tierFromWorkerName(agentType) ?? "medium"
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
