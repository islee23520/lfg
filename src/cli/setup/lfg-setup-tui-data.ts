import { isRecord } from "../../shared/json"
import { withReasoningEffort, type LazycodexAgentConfig, type ModelDiscovery, type ReasoningEffortChoice, type ReasoningLevel } from "../models/lfg-models"
import { slimNativeAgentOverrides, type LazycodexAgentModelOverride, type LazycodexAgentOverrideMap } from "../../grok/agents/lazycodex-agent-overrides"
import { getAgentRecommendation, type AgentRecommendationOverride } from "../../grok/models/model-recommendations"

export type RecommendationOverrideMap = Readonly<Record<string, AgentRecommendationOverride>>

export const WHY_TWO_MODEL_STEPS_BODY = [
  "These map discovery buckets only (not Grok host subagents):",
  "  fast = quick inspect work",
  "  reasoning = deep analysis",
  "  coding = implementation (executed on Codex App)",
  "",
  "Installed Grok agent surface is Sisyphus-only (CEO). Product work is handed to Codex App threads.",
  "Skip advanced steps to keep Sisyphus-only defaults.",
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

/** True for Grok-native model ids (the "vanilla Grok" surface). */
export function isGrokModel(model: string | undefined): boolean {
  return typeof model === "string" && (/^grok[-_/]/i.test(model) || model === "grok-build")
}

function selectBestGrokModels(modelIds: readonly string[]): {
  default: string
  fast: string
  reasoning: string
  coding: string
} {
  const grokModels = modelIds.filter(isUsableVanillaGrokModel)
  if (grokModels.length === 0) {
    return {
      default: VANILLA_DEFAULT_MODEL,
      fast: VANILLA_FAST_MODEL,
      reasoning: VANILLA_REASONING_MODEL,
      coding: VANILLA_CODING_MODEL,
    }
  }

  const reasoning = grokModels.find((id) => /grok-4\.5/i.test(id)) ||
                   grokModels.find((id) => /grok-4\.3/i.test(id)) ||
                   grokModels.find((id) => /grok-4.*reasoning/i.test(id)) ||
                   grokModels.find((id) => /grok-4/i.test(id)) ||
                   VANILLA_REASONING_MODEL

  const fast = grokModels.find((id) => /grok-composer.*fast/i.test(id)) ||
               grokModels.find((id) => /grok.*non-reasoning/i.test(id)) ||
               grokModels.find((id) => /grok.*fast/i.test(id)) ||
               VANILLA_FAST_MODEL

  const coding = grokModels.find((id) => /grok.*composer/i.test(id)) ||
                 grokModels.find((id) => /grok.*build/i.test(id)) ||
                 grokModels.find((id) => /grok.*non-reasoning/i.test(id)) ||
                 fast

  const defaultModel = grokModels.find((id) => /grok-4\.5/i.test(id)) ||
                       grokModels.find((id) => /grok-4\.3/i.test(id)) ||
                       grokModels.find((id) => /grok.*build/i.test(id)) ||
                       grokModels.find((id) => /grok-composer/i.test(id)) ||
                       reasoning ||
                       VANILLA_DEFAULT_MODEL

  return { default: defaultModel, fast, reasoning, coding }
}

export function pickGrokModel(primary: string | undefined, fallback: string | undefined, roleDefault: string): string {
  if (isUsableVanillaGrokModel(primary)) return primary as string
  if (isUsableVanillaGrokModel(fallback)) return fallback as string
  return roleDefault
}

export type VanillaGrokConfig = {
  readonly agentConfig: LazycodexAgentConfig
  readonly agentOverrideMap: LazycodexAgentOverrideMap
  readonly mapping: { readonly default: string; readonly fast: string; readonly reasoning: string; readonly coding: string }
}

const VANILLA_DEFAULT_MODEL = "grok-4.5"
const VANILLA_FAST_MODEL = "grok-composer-2.5-fast"
const VANILLA_REASONING_MODEL = "grok-4.5"
const VANILLA_CODING_MODEL = "grok-composer-2.5-fast"

const FASTISH_VANILLA_AGENTS = new Set(["explorer", "librarian", "quick", "unspecified-low", "sisyphus-junior"])
const CODING_VANILLA_AGENTS = new Set(["coding", "builder", "grok-build"])
const DEFAULT_VANILLA_AGENTS = new Set(["default", "sisyphus", "sisyphus-junior", "ulw"])

function isUsableVanillaGrokModel(model: string | undefined): boolean {
  return isGrokModel(model) && model !== "grok-3-mini-fast" && model !== "grok-3-mini"
}

function vanillaRoleDefault(name: string, fallbackDefault: string): string {
  if (CODING_VANILLA_AGENTS.has(name)) return VANILLA_CODING_MODEL
  if (FASTISH_VANILLA_AGENTS.has(name)) return VANILLA_FAST_MODEL
  if (DEFAULT_VANILLA_AGENTS.has(name)) return VANILLA_DEFAULT_MODEL
  return fallbackDefault
}

function hasVanillaRoleDefault(name: string): boolean {
  return CODING_VANILLA_AGENTS.has(name) || FASTISH_VANILLA_AGENTS.has(name) || DEFAULT_VANILLA_AGENTS.has(name)
}

export function buildVanillaGrokConfig(
  bundled: LazycodexAgentOverrideMap,
  discovery?: ModelDiscovery,
): VanillaGrokConfig {
  const best = discovery && discovery.modelIds.length > 0
    ? selectBestGrokModels(discovery.modelIds)
    : {
        default: VANILLA_DEFAULT_MODEL,
        fast: VANILLA_FAST_MODEL,
        reasoning: VANILLA_REASONING_MODEL,
        coding: VANILLA_CODING_MODEL,
      }

  const grokFor = (name: string, fallbackDefault: string): string => {
    const roleDefault = vanillaRoleDefault(name, fallbackDefault)
    if (hasVanillaRoleDefault(name)) return roleDefault
    const override = bundled[name]
    return pickGrokModel(override?.model, override?.modelFallback, roleDefault)
  }

  const explorerModel = best.fast
  const reasoningModel = best.reasoning
  const codingModel = best.coding
  const defaultModel = best.default

  const agentOverrideMap: Record<string, LazycodexAgentModelOverride> = {}
  for (const [name, override] of Object.entries(bundled)) {
    const model = grokFor(name, FASTISH_VANILLA_AGENTS.has(name) ? explorerModel : reasoningModel)
    const { modelFallback, modelFallbackReasoningLevel, modelFallbackServiceTier, ...rest } = override
    agentOverrideMap[name] = {
      ...rest,
      model,
      ...(isUsableVanillaGrokModel(modelFallback) ? { modelFallback } : {}),
      ...(isUsableVanillaGrokModel(modelFallback) && modelFallbackReasoningLevel !== undefined ? { modelFallbackReasoningLevel } : {}),
      ...(isUsableVanillaGrokModel(modelFallback) && modelFallbackServiceTier !== undefined ? { modelFallbackServiceTier } : {}),
    }
  }

  const level = (name: string, fallback: ReasoningLevel): ReasoningLevel => bundled[name]?.reasoningLevel ?? fallback
  const agentConfig: LazycodexAgentConfig = {
    explorer: { model: explorerModel, reasoningLevel: level("explorer", "low"), serviceTier: "fast" },
    reasoning: { model: reasoningModel, reasoningLevel: level("reasoning", "high") },
    coding: { model: codingModel, reasoningLevel: level("coding", "medium") },
  }

  return {
    agentConfig,
    agentOverrideMap: slimNativeAgentOverrides(agentOverrideMap),
    mapping: { default: defaultModel, fast: explorerModel, reasoning: reasoningModel, coding: codingModel },
  }
}

export function buildVanillaGrokDiscovery(
  bundled: LazycodexAgentOverrideMap,
  discovery?: ModelDiscovery,
  reasoningEffort: ReasoningEffortChoice = "auto",
): ModelDiscovery {
  const vanilla = buildVanillaGrokConfig(bundled, discovery)
  const modelIds = discovery?.modelIds && discovery.modelIds.length > 0
    ? discovery.modelIds
    : [...new Set([vanilla.mapping.default, vanilla.mapping.fast, vanilla.mapping.reasoning, vanilla.mapping.coding])]

  return {
    ...withReasoningEffort({
      baseUrl: discovery?.baseUrl || "",
      modelsUrl: discovery?.modelsUrl || "",
      modelIds,
      mapping: vanilla.mapping,
    }, reasoningEffort),
    agentOverrideMap: vanilla.agentOverrideMap,
  }
}

/** Short human note shown in the vanilla path before the install summary. */
export function formatVanillaSummary(config: VanillaGrokConfig): string {
  return [
    "Using built-in Grok models directly (vanilla host auth; no CLI proxy).",
    `default: ${config.mapping.default}`,
    `fast: ${config.mapping.fast}`,
    `reasoning: ${config.mapping.reasoning}`,
    `coding: ${config.mapping.coding}`,
  ].join("\n")
}

export function formatVanillaResults(config: VanillaGrokConfig): string {
  return [
    `default: ${config.mapping.default}`,
    `fast: ${config.mapping.fast}`,
    `reasoning: ${config.mapping.reasoning}`,
    `coding: ${config.mapping.coding}`,
    "Sisyphus-only profile will be installed; product work runs in Codex App.",
  ].join("\n")
}
