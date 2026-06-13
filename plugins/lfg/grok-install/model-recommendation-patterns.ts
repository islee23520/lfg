/** Dynamic pattern-based model auto-assignment (ported from lfp's model-recommendations.mjs).
 *
 * Unlike the static ROLE_RECOMMENDATIONS which are hardcoded benchmark data,
 * these functions scan the actually-discovered model IDs and pattern-match
 * to assign the best available model per agent.
 *
 * Patterns are Grok-first: Grok model IDs are preferred over GPT/Gemini/Claude
 * equivalents at the same tier.
 */

import type { LazycodexAgentModelOverride, LazycodexAgentOverrideMap, ServiceTier } from "./lazycodex-agent-overrides"
import type { ReasoningLevel } from "../bin/lfg-models"

export type PatternKind = "reasoning" | "utility"

export type RecommendedModelFields = {
  readonly model: string
  readonly reasoningLevel: ReasoningLevel
  readonly serviceTier: ServiceTier
}

/** Agents that need deep reasoning models (ported from lfp + Grok additions). */
export const REASONING_AGENT_NAMES: ReadonlySet<string> = new Set([
  "metis",
  "momus",
  "plan",
  "ulw-plan",
  "review-work",
  "codex-ultrawork-reviewer",
  "reasoning",
])

/** Pattern arrays ordered by preference. Grok IDs first, then GPT/Gemini/Claude fallbacks. */

// Reasoning-capable models: deep-chain-of-thought models for planning/analysis/review.
export const REASONING_MODEL_PATTERNS: readonly RegExp[] = [
  /grok-4\.[0-9]+.*reasoning/i,
  /grok-4\.3/i,
  /grok-4\.[0-9]+/i,
  /grok.*reasoning/i,
  /gpt-5\.5/i,
  /gpt-5(?!.*mini)/i,
  /gemini.*pro/i,
  /claude.*opus/i,
  /o[1-4]/i,
  /reasoning/i,
  /reason/i,
]

// Utility models: fast, cheap, high-volume agents (explorer, librarian, coding non-reasoning).
export const UTILITY_MODEL_PATTERNS: readonly RegExp[] = [
  /grok-3-mini-fast/i,
  /grok-3-mini/i,
  /grok-4\.[0-9]+.*non-reasoning/i,
  /grok.*mini/i,
  /grok.*fast/i,
  /grok-build/i,
  /gpt-5\.[0-9]+-mini/i,
  /gpt-5\.[0-9]+.*mini/i,
  /gpt.*mini/i,
  /mini/i,
  /fast/i,
  /flash/i,
  /gpt-5\.[0-9]+/i,
  /gpt-5/i,
]

// GPT-first variant patterns (used when preset === "gpt").
export const GPT_REASONING_MODEL_PATTERNS: readonly RegExp[] = [
  /gpt-5\.5/i,
  /gpt-5(?!.*mini)/i,
  /grok-4\.[0-9]+.*reasoning/i,
  /grok-4\.3/i,
  /grok-4\.[0-9]+/i,
  /gemini.*pro/i,
  /claude.*opus/i,
  /o[1-4]/i,
  /reasoning/i,
]

export const GPT_UTILITY_MODEL_PATTERNS: readonly RegExp[] = [
  /gpt-5\.[0-9]+-mini/i,
  /gpt-5\.[0-9]+.*mini/i,
  /gpt.*mini/i,
  /mini/i,
  /fast/i,
  /flash/i,
  /grok-3-mini-fast/i,
  /grok-3-mini/i,
  /grok.*mini/i,
  /grok.*fast/i,
  /grok-build/i,
  /gpt-5\.[0-9]+/i,
  /gpt-5/i,
]

export type RecommendationPreset = "grok" | "gpt"

function patternsForKind(kind: PatternKind, preset?: RecommendationPreset): readonly RegExp[] {
  if (preset === "gpt") {
    return kind === "reasoning" ? GPT_REASONING_MODEL_PATTERNS : GPT_UTILITY_MODEL_PATTERNS
  }
  return kind === "reasoning" ? REASONING_MODEL_PATTERNS : UTILITY_MODEL_PATTERNS
}

/** Select the best model from a list matching the given pattern kind. */
export function selectModelForPatterns(
  models: readonly string[],
  kind: PatternKind,
  preset?: RecommendationPreset,
): string | undefined {
  const patterns = patternsForKind(kind, preset)
  for (const pattern of patterns) {
    const matches = models.filter((model) => pattern.test(model))
    if (matches.length > 0) {
      // Prefer lowercase canonical id when multiple aliases match the same pattern
      return matches.find((m) => m === m.toLowerCase()) ?? matches[0]
    }
  }
  return models[0]
}

/** Build recommended model fields for a single agent based on whether it needs reasoning. */
export function recommendAgentModelFields(
  agentName: string,
  models: readonly string[],
  preset?: RecommendationPreset,
): RecommendedModelFields | undefined {
  const isReasoning = REASONING_AGENT_NAMES.has(agentName)
  const kind: PatternKind = isReasoning ? "reasoning" : "utility"
  const model = selectModelForPatterns(models, kind, preset)
  if (model === undefined) return undefined
  return {
    model,
    reasoningLevel: isReasoning ? "high" : "low",
    serviceTier: isReasoning ? "default" : "fast",
  }
}

/** Build recommendations for all agents in an override map from discovered models.
 * Returns a Map keyed by agent name. Agents where no model can be selected are omitted.
 */
export function buildRecommendedModelOverrides(
  overrides: LazycodexAgentOverrideMap,
  models: readonly string[],
  preset?: RecommendationPreset,
): Map<string, RecommendedModelFields> {
  const recommendations = new Map<string, RecommendedModelFields>()
  for (const agentName of Object.keys(overrides)) {
    const fields = recommendAgentModelFields(agentName, models, preset)
    if (fields !== undefined) {
      recommendations.set(agentName, fields)
    }
  }
  return recommendations
}

/** Apply recommendations into an existing override map (mutable, lfp-style merge).
 * Only model + reasoningLevel + serviceTier are set; fallback fields are preserved.
 */
export function applyRecommendedModelOverrides(
  overrides: Record<string, { model: string; reasoningLevel: string; serviceTier?: string }>,
  recommendations: Map<string, RecommendedModelFields>,
): void {
  for (const [agentName, fields] of recommendations) {
    const existing = overrides[agentName] ?? {}
    overrides[agentName] = {
      ...existing,
      model: fields.model,
      reasoningLevel: fields.reasoningLevel,
      serviceTier: fields.serviceTier,
    }
  }
}


/** Role agents that already receive model assignment from discovery.mapping.
 * Recommendations skip these to preserve the curated mapping-layer selection.
 */
const ROLE_AGENT_NAMES = new Set(["explorer", "reasoning", "coding"])

/** Apply pattern-based recommendations to an override map, preserving fallback fields.
 *
 * For each non-role agent, if a recommended model is found among the discovered
 * models, the agent's model + reasoningLevel + serviceTier are updated. Role
 * agents (explorer, reasoning, coding) are left unchanged since they receive
 * curated models from the discovery mapping layer. Fallback fields are always
 * preserved.
 *
 * Returns a new map; does not mutate the input.
 */
export function applyRecommendationsToOverrideMap(
  overrides: LazycodexAgentOverrideMap,
  models: readonly string[],
  preset?: RecommendationPreset,
): LazycodexAgentOverrideMap {
  if (models.length === 0) return overrides
  const out: Record<string, LazycodexAgentModelOverride> = {}
  for (const [name, setting] of Object.entries(overrides)) {
    if (ROLE_AGENT_NAMES.has(name)) {
      out[name] = setting
      continue
    }
    const rec = recommendAgentModelFields(name, models, preset)
    if (rec === undefined) {
      out[name] = setting
      continue
    }
    out[name] = {
      ...setting,
      model: rec.model,
      reasoningLevel: rec.reasoningLevel,
      serviceTier: rec.serviceTier,
    }
  }
  return out
}
