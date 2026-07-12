import type { ReasoningLevel } from "../../cli/models/lfg-models"
import type { LazycodexAgentModelOverride, LazycodexAgentOverrideMap, ServiceTier } from "../agents/lazycodex-agent-overrides"
import { recommendAgentModelFields } from "./model-recommendation-patterns"

const CURATED_OVERRIDE_AGENT_NAMES = new Set([
  "explorer",
  "reasoning",
  "coding",
  "default",
  "sisyphus",
  "prometheus",
  "atlas",
  "oracle",
  "multimodal-looker",
  "sisyphus-junior",
])

type AvailableFallback = {
  readonly model: string
  readonly reasoningLevel?: ReasoningLevel
  readonly serviceTier?: ServiceTier
}

export function applyRecommendationsToOverrideMap(
  overrides: LazycodexAgentOverrideMap,
  models: readonly string[],
): LazycodexAgentOverrideMap {
  if (models.length === 0) return overrides
  const availableModels = new Set(models)
  const out: Record<string, LazycodexAgentModelOverride> = {}
  for (const [name, setting] of Object.entries(overrides)) {
    out[name] = availableOverrideFor(name, setting, models, availableModels)
  }
  return out
}

function availableOverrideFor(
  name: string,
  setting: LazycodexAgentModelOverride,
  models: readonly string[],
  availableModels: ReadonlySet<string>,
): LazycodexAgentModelOverride {
  if (CURATED_OVERRIDE_AGENT_NAMES.has(name) && availableModels.has(setting.model)) {
    return stripUnavailableFallback(setting, availableModels)
  }
  if (CURATED_OVERRIDE_AGENT_NAMES.has(name)) {
    const fallback = availableFallbackFor(setting, availableModels)
    if (fallback !== undefined) {
      return stripUnavailableFallback(
        {
          ...setting,
          model: fallback.model,
          reasoningLevel: fallback.reasoningLevel ?? setting.reasoningLevel,
          ...(fallback.serviceTier !== undefined ? { serviceTier: fallback.serviceTier } : {}),
        },
        availableModels,
      )
    }
  }
  const recommendation = recommendAgentModelFields(name, models)
  if (recommendation === undefined) {
    return stripUnavailableFallback(setting, availableModels)
  }
  return stripUnavailableFallback(
    {
      ...setting,
      model: recommendation.model,
      reasoningLevel: recommendation.reasoningLevel,
      serviceTier: recommendation.serviceTier,
    },
    availableModels,
  )
}

function availableFallbackFor(
  setting: LazycodexAgentModelOverride,
  availableModels: ReadonlySet<string>,
): AvailableFallback | undefined {
  if (setting.modelFallback === undefined || !availableModels.has(setting.modelFallback)) {
    return undefined
  }
  return {
    model: setting.modelFallback,
    ...(setting.modelFallbackReasoningLevel !== undefined ? { reasoningLevel: setting.modelFallbackReasoningLevel } : {}),
    ...(setting.modelFallbackServiceTier !== undefined ? { serviceTier: setting.modelFallbackServiceTier } : {}),
  }
}

function stripUnavailableFallback(
  setting: LazycodexAgentModelOverride,
  availableModels: ReadonlySet<string>,
): LazycodexAgentModelOverride {
  if (setting.modelFallback === undefined) {
    return setting
  }
  if (setting.modelFallback !== setting.model && availableModels.has(setting.modelFallback)) {
    return setting
  }
  const { modelFallback, modelFallbackReasoningLevel, modelFallbackServiceTier, ...withoutFallback } = setting
  return withoutFallback
}
