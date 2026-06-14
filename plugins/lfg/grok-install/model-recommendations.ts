/** Model recommendation data and scoring for interactive setup.
 *
 * Recommendations are availability-aware: setup only recommends models that
 * the user's OpenAI-compatible /v1/models endpoint actually exposes. The
 * preference order is benchmark-informed and Grok-centered, with GPT used for
 * critical review help when available. GLM and Gemini are included as measured
 * fallback/alternative families.
 */

export type ModelPerf = {
  readonly model: string
  readonly latencyMs: number
  readonly tokensPerSec: number
  readonly codingQuality: number
  readonly reasoningQuality: number
  readonly available: boolean
}

export type RoleRecommendation = {
  readonly role: string
  readonly recommended: string
  readonly reasoningEffort: string
  readonly rationale: string
  readonly alternatives: readonly string[]
}

type RoleProfile = {
  readonly role: string
  readonly reasoningEffort: string
  readonly rationale: string
  readonly preferredModels: readonly string[]
}

/** Performance snapshot from local live benchmarking against the setup proxy. */
export const PERF_SNAPSHOT: Readonly<Record<string, ModelPerf>> = {
  "grok-4.3": { model: "grok-4.3", latencyMs: 3094, tokensPerSec: 119, codingQuality: 2, reasoningQuality: 2, available: true },
  "grok-4.20-0309-non-reasoning": { model: "grok-4.20-0309-non-reasoning", latencyMs: 623, tokensPerSec: 61, codingQuality: 2, reasoningQuality: 2, available: true },
  "grok-4.20-0309-reasoning": { model: "grok-4.20-0309-reasoning", latencyMs: 2331, tokensPerSec: 174, codingQuality: 2, reasoningQuality: 2, available: true },
  "grok-3-mini-fast": { model: "grok-3-mini-fast", latencyMs: 4046, tokensPerSec: 129, codingQuality: 2, reasoningQuality: 1, available: true },
  "grok-composer-2.5-fast": { model: "grok-composer-2.5-fast", latencyMs: 2389, tokensPerSec: 139, codingQuality: 2, reasoningQuality: 2, available: true },
  "grok-build-0.1": { model: "grok-build-0.1", latencyMs: 4549, tokensPerSec: 121, codingQuality: 2, reasoningQuality: 2, available: true },
  "gpt-5.5": { model: "gpt-5.5", latencyMs: 2440, tokensPerSec: 23, codingQuality: 2, reasoningQuality: 2, available: true },
  "gpt-5.3-codex-spark": { model: "gpt-5.3-codex-spark", latencyMs: 1143, tokensPerSec: 236, codingQuality: 2, reasoningQuality: 2, available: true },
  "gpt-5.4-mini": { model: "gpt-5.4-mini", latencyMs: 980, tokensPerSec: 85, codingQuality: 2, reasoningQuality: 1, available: true },
  "gemini-3-pro-low": { model: "gemini-3-pro-low", latencyMs: 448, tokensPerSec: 73, codingQuality: 2, reasoningQuality: 2, available: true },
  "gemini-3-pro-high": { model: "gemini-3-pro-high", latencyMs: 603, tokensPerSec: 49, codingQuality: 2, reasoningQuality: 2, available: true },
  "glm-5-turbo": { model: "glm-5-turbo", latencyMs: 3745, tokensPerSec: 54, codingQuality: 2, reasoningQuality: 2, available: true },
  "glm-5.2": { model: "glm-5.2", latencyMs: 6979, tokensPerSec: 30, codingQuality: 2, reasoningQuality: 2, available: true },
  "gemini-3.1-flash-lite": { model: "gemini-3.1-flash-lite", latencyMs: 1681, tokensPerSec: 27, codingQuality: 2, reasoningQuality: 1, available: true },
  "gemini-3.5-flash-low": { model: "gemini-3.5-flash-low", latencyMs: 2174, tokensPerSec: 17, codingQuality: 2, reasoningQuality: 1, available: true },
}

const ROLE_PROFILES: readonly RoleProfile[] = [
  {
    role: "explorer",
    reasoningEffort: "medium",
    rationale: "Fast Grok utility path for high-volume codebase search and exploration (LazyCodex 4.9.2 default). GPT/Gemini fallbacks when available.",
    preferredModels: ["grok-4.20-0309-non-reasoning", "grok-3-mini-fast", "grok-composer-2.5-fast", "grok-build-0.1", "gpt-5.3-codex-spark", "gemini-3-pro-low", "glm-5-turbo"],
  },
  {
    role: "librarian",
    reasoningEffort: "low",
    rationale: "Grok-first research route (LazyCodex 4.9.2 librarian default). Fast utility models for external doc lookup.",
    preferredModels: ["grok-3-mini-fast", "grok-composer-2.5-fast", "grok-4.20-0309-non-reasoning", "gpt-5.4-mini", "glm-5-turbo", "gemini-3.1-flash-lite"],
  },
  {
    role: "plan",
    reasoningEffort: "high",
    rationale: "Deep Grok reasoning for strategic planning (LazyCodex 4.9.2 plan default). GPT-5.5 as strong alternative when present.",
    preferredModels: ["grok-4.20-0309-reasoning", "grok-4.3", "gpt-5.5", "gpt-5.3-codex-spark", "glm-5.2", "gemini-3-pro-high"],
  },
  {
    role: "metis",
    reasoningEffort: "high",
    rationale: "Pre-planning analysis benefits from Grok frontier reasoning (LazyCodex 4.9.2 metis default).",
    preferredModels: ["grok-4.3", "grok-4.20-0309-reasoning", "gpt-5.5", "gpt-5.3-codex-spark", "glm-5.2", "gemini-3-pro-high"],
  },
  {
    role: "momus",
    reasoningEffort: "high",
    rationale: "Critical plan review uses Grok frontier models (LazyCodex 4.9.2 momus default). GPT-5.5 strong alternative.",
    preferredModels: ["gpt-5.5", "grok-4.20-0309-reasoning", "grok-4.3", "gpt-5.3-codex-spark", "glm-5.2", "gemini-3-pro-high"],
  },
  {
    role: "codex-ultrawork-reviewer",
    reasoningEffort: "high",
    rationale: "Final ultrawork review uses Grok frontier (LazyCodex 4.9.2 reviewer default). GPT as strong second opinion.",
    preferredModels: ["gpt-5.5", "grok-4.20-0309-reasoning", "grok-4.3", "gpt-5.3-codex-spark", "glm-5.2", "gemini-3-pro-high"],
  },
  {
    role: "reasoning",
    reasoningEffort: "medium",
    rationale: "General reasoning role uses Grok frontier models (LazyCodex 4.9.2 alignment).",
    preferredModels: ["grok-4.3", "grok-4.20-0309-reasoning", "gpt-5.5", "gpt-5.3-codex-spark", "glm-5.2", "gemini-3-pro-high"],
  },
  {
    role: "coding",
    reasoningEffort: "medium",
    rationale: "Coding uses fast Grok non-reasoning or specialized coding path (LazyCodex 4.9.2 coding default).",
    preferredModels: ["grok-4.20-0309-non-reasoning", "grok-build-0.1", "gpt-5.3-codex-spark", "grok-4.3", "glm-5-turbo", "gemini-3-pro-low"],
  },
]

/** Availability-aware role recommendations for a representative full model set. */
export const ROLE_RECOMMENDATIONS: readonly RoleRecommendation[] = buildRoleRecommendations(Object.keys(PERF_SNAPSHOT))

export function buildRoleRecommendations(availableModels: readonly string[]): readonly RoleRecommendation[] {
  return ROLE_PROFILES.map((profile) => resolveRoleRecommendation(profile, availableModels))
}

/** Format a recommendation table for terminal output. */
export function formatRecommendationTable(
  availableModels: readonly string[],
): string {
  const recs = buildRoleRecommendations(availableModels)
  const lines: string[] = []
  lines.push("Agent Model Recommendations (available-model aware, benchmarked)")
  lines.push("─".repeat(92))
  lines.push(padCol("Agent", 28) + padCol("Recommended", 30) + padCol("Latency", 10) + padCol("t/s", 8) + "Rationale")
  lines.push("─".repeat(92))
  for (const rec of recs) {
    const perf = PERF_SNAPSHOT[rec.recommended]
    const latency = perf ? `${perf.latencyMs}ms` : "n/a"
    const tps = perf ? `${perf.tokensPerSec}` : "n/a"
    lines.push(padCol(rec.role, 28) + padCol(rec.recommended, 30) + padCol(latency, 10) + padCol(tps, 8) + rec.rationale)
  }
  lines.push("─".repeat(92))
  lines.push("")
  lines.push("Available alternatives per agent:")
  for (const rec of recs) {
    if (rec.alternatives.length > 0) {
      lines.push(`  ${rec.role}: ${rec.alternatives.join(", ")}`)
    }
  }
  return lines.join("\n")
}

/** Score how suitable a model is for a given agent role. */
export function scoreModelForRole(
  model: string,
  role: string,
  perfData: Readonly<Record<string, ModelPerf>> = PERF_SNAPSHOT,
): number {
  const profile = ROLE_PROFILES.find((r) => r.role === role)
  if (profile === undefined) {
    return 50
  }
  const rank = profile.preferredModels.indexOf(model)
  if (rank >= 0) {
    return Math.max(100 - rank * 8, 60)
  }
  const perf = perfData[model]
  if (perf === undefined) {
    return 40
  }
  const speedScore = Math.max(0, 100 - perf.latencyMs / 120)
  const qualityScore = (perf.codingQuality + perf.reasoningQuality) * 20
  return Math.round((speedScore + qualityScore) / 2)
}

function resolveRoleRecommendation(profile: RoleProfile, availableModels: readonly string[]): RoleRecommendation {
  const available = profile.preferredModels.filter((model) => availableModels.includes(model))
  const recommended = available[0] ?? firstChatModel(availableModels) ?? profile.preferredModels[0] ?? "grok-4.20-0309-non-reasoning"
  return {
    role: profile.role,
    recommended,
    reasoningEffort: profile.reasoningEffort,
    rationale: profile.rationale,
    alternatives: available.filter((model) => model !== recommended).slice(0, 4),
  }
}

function firstChatModel(models: readonly string[]): string | undefined {
  return models.find((model) => !/(image|imagine|video|embedding)/i.test(model))
}

function padCol(text: string, width: number): string {
  const t = text.length > width ? text.slice(0, width - 1) + "\u2026" : text
  return t.padEnd(width)
}
