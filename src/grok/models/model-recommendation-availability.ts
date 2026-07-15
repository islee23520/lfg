import type { ReasoningLevel } from "../../cli/models/lfg-models"
import {
  AGENT_MODEL_REQUIREMENTS,
  CATEGORY_MODEL_REQUIREMENTS,
} from "../../core/omo/model-core"
import type { LazycodexAgentModelOverride, LazycodexAgentOverrideMap, ServiceTier } from "../agents/lazycodex-agent-overrides"
import { buildGrokModelCatalog, resolveGrokModel } from "./grok-model-adapter"
import { catalogLooksLikeCliProxy } from "./catalog-from-config"
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

export type ApplyRecommendationsOptions = {
  /**
   * True only when a real CLI proxy is configured (endpoints.models_base_url,
   * omo.providers.*, or discovery from an explicit proxy URL). Model-id shape alone
   * is not enough — upgrading to openai/anthropic without a proxy causes host 401s.
   */
  readonly hasCliProxy?: boolean
}

/**
 * Availability-aware override rewrite.
 *
 * When a real CLI proxy is configured (9router etc.) AND discovered models look
 * multi-provider, prefer OMO `AGENT_MODEL_REQUIREMENTS` / `CATEGORY_MODEL_REQUIREMENTS`
 * chains so Claude/GPT/Gemini win when the proxy exposes them. Pure-Grok / host-auth
 * catalogs keep curated + pattern behavior and never force foreign providers.
 */
export function applyRecommendationsToOverrideMap(
  overrides: LazycodexAgentOverrideMap,
  models: readonly string[],
  options: ApplyRecommendationsOptions = {},
): LazycodexAgentOverrideMap {
  if (models.length === 0) return overrides
  const availableModels = new Set(models)
  // Require an actual proxy gate — bare multi-provider-looking ids without a proxy
  // must not trigger OMO foreign-provider promotion (host 401 after auth recovery).
  const useOmoChains = options.hasCliProxy === true && catalogLooksLikeCliProxy(models)
  const catalog = useOmoChains ? buildGrokModelCatalog({ modelIds: models }) : null
  const out: Record<string, LazycodexAgentModelOverride> = {}
  for (const [name, setting] of Object.entries(overrides)) {
    out[name] = availableOverrideFor(name, setting, models, availableModels, catalog)
  }
  return out
}

function availableOverrideFor(
  name: string,
  setting: LazycodexAgentModelOverride,
  models: readonly string[],
  availableModels: ReadonlySet<string>,
  catalog: ReturnType<typeof buildGrokModelCatalog> | null,
): LazycodexAgentModelOverride {
  // CLI proxy path: keep an already-available non-Grok primary (user/bundled multi-provider
  // pick). When the current primary is Grok (or missing), walk OMO agent/category chains so
  // Claude/GPT/Gemini from 9router-style proxies win over the Grok safety-net default.
  if (catalog !== null) {
    if (modelIsAvailable(setting.model, availableModels) && !isGrokModelId(setting.model)) {
      return stripUnavailableFallback(setting, availableModels)
    }
    const omo = resolveFromOmoRequirements(name, setting, catalog, availableModels)
    if (omo !== undefined) {
      return stripUnavailableFallback(omo, availableModels)
    }
  }

  if (CURATED_OVERRIDE_AGENT_NAMES.has(name) && modelIsAvailable(setting.model, availableModels)) {
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

function resolveFromOmoRequirements(
  name: string,
  setting: LazycodexAgentModelOverride,
  catalog: ReturnType<typeof buildGrokModelCatalog>,
  availableModels: ReadonlySet<string>,
): LazycodexAgentModelOverride | undefined {
  const requirements =
    name in AGENT_MODEL_REQUIREMENTS
      ? AGENT_MODEL_REQUIREMENTS
      : name in CATEGORY_MODEL_REQUIREMENTS
        ? CATEGORY_MODEL_REQUIREMENTS
        : null
  if (requirements === null) return undefined

  const { resolved } = resolveGrokModel({
    catalog,
    requirementKey: name,
    requirements,
    userFallbackModels:
      setting.modelFallback !== undefined && modelIsAvailable(setting.modelFallback, availableModels)
        ? [setting.modelFallback]
        : undefined,
    systemDefaultModel: pickGrokSystemDefault(catalog.availableModels),
  })
  if (resolved === undefined) return undefined

  const bare = bareModelId(resolved.model)
  // Prefer a discovered id that matches (keep provider-qualified form if that is what proxy listed).
  const model = matchDiscoveredId(bare, availableModels) ?? bare
  if (!modelIsAvailable(model, availableModels)) return undefined
  const reasoningLevel = variantToReasoningLevel(resolved.variant) ?? setting.reasoningLevel

  return {
    ...setting,
    model,
    reasoningLevel,
  }
}

function availableFallbackFor(
  setting: LazycodexAgentModelOverride,
  availableModels: ReadonlySet<string>,
): AvailableFallback | undefined {
  if (setting.modelFallback === undefined || !modelIsAvailable(setting.modelFallback, availableModels)) {
    return undefined
  }
  return {
    model: matchDiscoveredId(setting.modelFallback, availableModels) ?? setting.modelFallback,
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
  if (
    setting.modelFallback !== setting.model &&
    modelIsAvailable(setting.modelFallback, availableModels)
  ) {
    return setting
  }
  const { modelFallback: _fb, modelFallbackReasoningLevel: _fr, modelFallbackServiceTier: _ft, ...withoutFallback } =
    setting
  return withoutFallback
}

export function modelIsAvailable(model: string, availableModels: ReadonlySet<string>): boolean {
  if (availableModels.has(model)) return true
  const bare = bareModelId(model)
  if (availableModels.has(bare)) return true
  for (const id of availableModels) {
    if (bareModelId(id) === bare) return true
  }
  return false
}

function matchDiscoveredId(model: string, availableModels: ReadonlySet<string>): string | undefined {
  if (availableModels.has(model)) return model
  const bare = bareModelId(model)
  if (availableModels.has(bare)) return bare
  for (const id of availableModels) {
    if (bareModelId(id) === bare) return id
  }
  return undefined
}

function bareModelId(model: string): string {
  return model.includes("/") ? model.split("/").slice(1).join("/") : model
}

function isGrokModelId(model: string): boolean {
  const bare = bareModelId(model).toLowerCase()
  return bare.startsWith("grok-") || bare === "grok"
}

function variantToReasoningLevel(variant: string | undefined): ReasoningLevel | undefined {
  if (variant === undefined) return undefined
  switch (variant) {
    case "low":
    case "medium":
    case "high":
    case "xhigh":
      return variant
    case "max":
      return "xhigh"
    default:
      return undefined
  }
}

function pickGrokSystemDefault(available: ReadonlySet<string>): string | undefined {
  for (const id of available) {
    if (id.startsWith("xai/grok-") || bareModelId(id).startsWith("grok-")) {
      return id
    }
  }
  return undefined
}
