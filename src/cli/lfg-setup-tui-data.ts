import { isRecord } from "./lfg-json"
import type { ModelDiscovery } from "./lfg-models"
import type { LazycodexAgentOverrideMap } from "../grok-adapter/lazycodex-agent-overrides"
import { getAgentRecommendation, type AgentRecommendationOverride } from "../grok-adapter/model-recommendations"

export type RecommendationOverrideMap = Readonly<Record<string, AgentRecommendationOverride>>

export const WHY_TWO_MODEL_STEPS_BODY = [
  "The first 3 prompts set the base role routes used by normal setup:",
  "  explorer = fast search/read work",
  "  reasoning = deep analysis/planning work",
  "  coding = implementation work",
  "",
  "Core + ULW overrides tune the named OMO/ultrawork agents individually, such as sisyphus, prometheus, plan, metis, momus, and codex-ultrawork-reviewer.",
  "Skip this to keep the bundled recommendations for those agents.",
].join("\n")

export function readDiscoveryFromContext(context: unknown): ModelDiscovery | null {
  if (!isRecord(context)) return null
  const resolved = context.resolved
  if (isRecord(resolved) && isModelDiscovery(resolved.discovery)) return resolved.discovery
  const plan = context.plan
  if (isRecord(plan) && isModelDiscovery(plan.modelDiscovery)) return plan.modelDiscovery
  return null
}

export function toRecommendationOverrideMap(overrides: LazycodexAgentOverrideMap): RecommendationOverrideMap {
  return Object.fromEntries(
    Object.entries(overrides).map(([name, override]) => [
      name,
      {
        model: override.model,
        ...(override.reasoningLevel !== undefined ? { model_reasoning_effort: override.reasoningLevel } : {}),
        ...(override.modelFallback !== undefined ? { model_fallback: override.modelFallback } : {}),
        ...(override.modelFallbackReasoningLevel !== undefined ? { model_fallback_reasoning_effort: override.modelFallbackReasoningLevel } : {}),
        ...(override.roleRationale !== undefined ? { role_rationale: override.roleRationale } : {}),
      },
    ]),
  )
}

export function formatAgentRecommendationBody(rec: NonNullable<ReturnType<typeof getAgentRecommendation>>): string {
  const variant = rec.variant !== undefined ? ` (${rec.variant})` : ""
  return [
    `Recommended: ${rec.recommended}${variant}`,
    rec.rationale,
    rec.fullChain.length > 0 ? `Fallback chain: ${rec.fullChain.join(" → ")}` : "",
  ].filter(Boolean).join("\n")
}

function isModelDiscovery(value: unknown): value is ModelDiscovery {
  if (!isRecord(value)) return false
  return (
    typeof value.baseUrl === "string" &&
    typeof value.modelsUrl === "string" &&
    isStringArray(value.modelIds) &&
    isRecord(value.mapping) &&
    typeof value.mapping.default === "string" &&
    typeof value.mapping.fast === "string" &&
    typeof value.mapping.reasoning === "string" &&
    typeof value.mapping.coding === "string"
  )
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
}
