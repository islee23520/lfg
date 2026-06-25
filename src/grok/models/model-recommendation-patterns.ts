/** Dynamic pattern-based model auto-assignment (ported from lfp's model-recommendations.mjs).
 *
 * Unlike the static ROLE_RECOMMENDATIONS which are hardcoded benchmark data,
 * these functions scan the actually-discovered model IDs and pattern-match
 * to assign the best available model per agent.
 *
 * Patterns are role-first: GPT/GLM are preferred for orchestration and reasoning,
 * Composer is preferred for pure coding, and Gemini is preferred for visual work.
 */

import type { LazycodexAgentOverrideMap, ServiceTier } from "../agents/lazycodex-agent-overrides"
import type { ReasoningLevel } from "../../cli/models/lfg-models"

export type PatternKind = "reasoning" | "utility" | "critical" | "coding" | "visual"

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
  "prometheus",
  "ulw-plan",
  "review-work",
  "codex-ultrawork-reviewer",
  "reasoning",
  "oracle",
  "hephaestus",
  "atlas",
  "deep",
  "ultrabrain",
  "unspecified-high",
])

const CRITICAL_REVIEW_AGENT_NAMES: ReadonlySet<string> = new Set([
  "momus",
  "review-work",
  "codex-ultrawork-reviewer",
])

const CODING_AGENT_NAMES: ReadonlySet<string> = new Set([
  "coding",
  "builder",
  "grok-build",
])

const VISUAL_AGENT_NAMES: ReadonlySet<string> = new Set([
  "multimodal-looker",
  "visual-looker",
  "visual-engineering",
  "artistry",
  "artistry-gen",
  "artistry-qa",
])

/** Per-agent optimal reasoning levels for auto preset.
 * Agents not listed here fall back to the kind-based default (high for reasoning, medium for utility).
 */
const AGENT_REASONING_LEVEL: Readonly<Record<string, ReasoningLevel>> = {
  // xhigh: strategic planning, adversarial review, deepest reasoning
  oracle: "xhigh",
  prometheus: "xhigh",
  plan: "xhigh",
  momus: "xhigh",
  ultrabrain: "xhigh",
  // high: deep execution, analysis, review
  atlas: "high",
  hephaestus: "high",
  deep: "high",
  metis: "high",
  reasoning: "high",
  reviewer: "high",
  "codex-ultrawork-reviewer": "high",
  "unspecified-high": "high",
  // medium: orchestration, coding, balanced
  sisyphus: "medium",
  default: "medium",
  coding: "medium",
  "sisyphus-junior": "medium",
  // low: search, retrieval, simple tasks
  explorer: "low",
  librarian: "low",
  quick: "low",
  "multimodal-looker": "low",
  "unspecified-low": "low",
  writing: "low",
}

/** Pattern arrays ordered by preference. Grok IDs first, then GPT/Gemini/Claude fallbacks. */

// Reasoning-capable models: deep-chain-of-thought models for planning/analysis/review.
export const REASONING_MODEL_PATTERNS: readonly RegExp[] = [
  /gpt-5\.5/i,
  /glm-5\.2/i,
  /gpt-5(?!.*mini)/i,
  /glm-5/i,
  /grok-4\.3/i,
  /grok-4\.[0-9]+.*reasoning/i,
  /grok-4\.[0-9]+/i,
  /grok.*reasoning/i,
  /gemini-3.*pro.*high/i,
  /gemini.*pro/i,
  /claude.*opus/i,
  /o[1-4]/i,
  /reasoning/i,
  /reason/i,
]

// Utility models: fast, cheap, high-volume agents (explorer, librarian, coding non-reasoning).
// grok-composer is preferred for orchestrator roles (sisyphus/default) due to strong
// task-decomposition and context-maintenance characteristics at fast tier.
export const UTILITY_MODEL_PATTERNS: readonly RegExp[] = [
  /gpt-5\.[0-9]+-mini.*fast/i,
  /gpt-5\.[0-9]+.*mini/i,
  /glm-5.*turbo/i,
  /gemini-3\.1-flash-lite/i,
  /gemini-3.*flash/i,
  /gpt.*mini/i,
  /grok-3-mini-fast/i,
  /grok-composer.*fast/i,
  /grok-4\.[0-9]+.*non-reasoning/i,
  /grok-3-mini/i,
  /grok.*mini/i,
  /grok.*fast/i,
  /grok-build/i,
  /gemini-3.*pro.*low/i,
  /gemini-3.*pro.*high/i,
  /glm-5\.2/i,
  /mini/i,
  /fast/i,
  /flash/i,
  /gpt-5\.[0-9]+/i,
  /gpt-5/i,
]

export const CRITICAL_MODEL_PATTERNS: readonly RegExp[] = [
  /gpt-5\.5/i,
  /glm-5\.2/i,
  /grok-4\.3/i,
  /grok-4\.[0-9]+.*reasoning/i,
  /glm-5.*turbo/i,
  /gemini-3.*pro.*high/i,
  /gemini.*pro/i,
]

export const VISUAL_MODEL_PATTERNS: readonly RegExp[] = [
  /gemini-3.*pro.*high/i,
  /gemini-3\.1.*pro/i,
  /gemini.*pro/i,
  /gemini.*vision/i,
  /gemini/i,
  /gpt-5\.5/i,
  /glm-5\.2/i,
  /grok-4\.3/i,
]

export const CODING_MODEL_PATTERNS: readonly RegExp[] = [
  /grok-composer-2\.5.*fast/i,
  /grok-composer/i,
  /grok-4\.[0-9]+.*non-reasoning/i,
  /grok-build/i,
  /glm-5.*turbo/i,
  /gemini-3.*pro.*low/i,
  /gemini-3.*pro.*high/i,
]

// GPT-first variant patterns (used when preset === "gpt").
export const GPT_REASONING_MODEL_PATTERNS: readonly RegExp[] = [
  /gpt-5\.5/i,
  /gpt-5(?!.*mini)/i,
  /grok-4\.[0-9]+.*reasoning/i,
  /grok-4\.3/i,
  /grok-4\.[0-9]+/i,
  /glm-5\.2/i,
  /gemini.*pro/i,
  /claude.*opus/i,
  /o[1-4]/i,
  /reasoning/i,
]

export const GPT_UTILITY_MODEL_PATTERNS: readonly RegExp[] = [
  /gpt-5\.[0-9]+-mini/i,
  /gpt-5\.[0-9]+.*mini/i,
  /gpt.*mini/i,
  /grok-4\.[0-9]+.*non-reasoning/i,
  /gemini-3.*pro.*low/i,
  /glm-5.*turbo/i,
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
    if (kind === "critical" || kind === "reasoning") return GPT_REASONING_MODEL_PATTERNS
    if (kind === "coding") return CODING_MODEL_PATTERNS
    if (kind === "visual") return VISUAL_MODEL_PATTERNS
    return GPT_UTILITY_MODEL_PATTERNS
  }
  if (kind === "critical") return CRITICAL_MODEL_PATTERNS
  if (kind === "coding") return CODING_MODEL_PATTERNS
  if (kind === "visual") return VISUAL_MODEL_PATTERNS
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
    // Filter out negated matches: e.g. a "reasoning" pattern must not match
    // "grok-4.20-0309-non-reasoning", and a "non-reasoning" utility pattern
    // must not be picked when the kind is "reasoning".
    const positive = matches.filter((model) => !isNegatedMatch(model, pattern, kind))
    if (positive.length > 0) {
      // Prefer lowercase canonical id when multiple aliases match the same pattern
      return positive.find((m) => m === m.toLowerCase()) ?? positive[0]
    }
    // If only negated matches exist, fall through to next pattern
  }
  return models[0]
}

/** Check if a model id is a negated match for the given kind.
 *  "non-reasoning" in a model id negates any reasoning-kind pattern match.
 *  "non-fast"/"slow" in a model id negates any utility-kind pattern match.
 */
function isNegatedMatch(model: string, _pattern: RegExp, kind: PatternKind): boolean {
  const lower = model.toLowerCase()
  if (lower.includes("non-reasoning") && (kind === "reasoning" || kind === "critical")) {
    return true
  }
  return false
}

/** Build recommended model fields for a single agent based on whether it needs reasoning.
 * Uses per-agent optimal reasoning levels for the auto preset; falls back to kind-based defaults.
 */
export function recommendAgentModelFields(
  agentName: string,
  models: readonly string[],
  preset?: RecommendationPreset,
): RecommendedModelFields | undefined {
  const isCritical = CRITICAL_REVIEW_AGENT_NAMES.has(agentName)
  const isReasoning = REASONING_AGENT_NAMES.has(agentName)
  const isCoding = CODING_AGENT_NAMES.has(agentName)
  const isVisual = VISUAL_AGENT_NAMES.has(agentName)
  const kind: PatternKind = isCritical ? "critical" : isCoding ? "coding" : isVisual ? "visual" : isReasoning ? "reasoning" : "utility"
  const model = selectModelForPatterns(models, kind, preset)
  if (model === undefined) return undefined
  const optimalLevel = AGENT_REASONING_LEVEL[agentName]
  return {
    model,
    reasoningLevel: optimalLevel ?? (isCritical || isReasoning ? "high" : "medium"),
    serviceTier: kind === "utility" ? "fast" : "default",
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
