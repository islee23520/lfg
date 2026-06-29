import { isRecord } from "../../shared/json"
import { withReasoningEffort, type LazycodexAgentConfig, type ModelDiscovery, type ReasoningEffortChoice, type ReasoningLevel } from "../models/lfg-models"
import type { LazycodexAgentModelOverride, LazycodexAgentOverrideMap } from "../../grok/agents/lazycodex-agent-overrides"
import { getAgentRecommendation, type AgentRecommendationOverride } from "../../grok/models/model-recommendations"

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

/** True for Grok-native model ids (the "vanilla Grok" surface). */
export function isGrokModel(model: string | undefined): boolean {
  return typeof model === "string" && (/^grok[-_/]/i.test(model) || model === "grok-build")
}

/** Select best available Grok models from discovery list (dynamic vanilla optimization).
 * Prioritizes latest grok-4 family for reasoning/default, grok-3-mini-fast for speed. */
function selectBestGrokModels(modelIds: readonly string[]): {
  default: string
  fast: string
  reasoning: string
  coding: string
} {
  const grokModels = modelIds.filter(isGrokModel)
  if (grokModels.length === 0) {
    return {
      default: VANILLA_DEFAULT_MODEL,
      fast: VANILLA_FAST_MODEL,
      reasoning: VANILLA_REASONING_MODEL,
      coding: VANILLA_CODING_MODEL,
    }
  }

  // Prefer grok-4.* for high quality, then grok-3, then composer/build
  const reasoning = grokModels.find((id) => /grok-4.*(reasoning|4\.20|4\.3)/i.test(id)) ||
                   grokModels.find((id) => /grok-4/i.test(id)) ||
                   grokModels.find((id) => /grok-3/i.test(id)) ||
                   VANILLA_REASONING_MODEL

  const fast = grokModels.find((id) => /grok.*(fast|mini-fast|composer)/i.test(id)) ||
               grokModels.find((id) => /grok-3.*mini.*fast/i.test(id)) ||
               grokModels.find((id) => /grok-3/i.test(id)) ||
               VANILLA_FAST_MODEL

  const coding = grokModels.find((id) => /grok.*(composer|4.*non-reasoning|build)/i.test(id)) ||
                 fast // fallback to fast for coding in vanilla

  const defaultModel = grokModels.find((id) => /grok-4/i.test(id)) || reasoning || VANILLA_DEFAULT_MODEL

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

const VANILLA_DEFAULT_MODEL = "grok-build-0.1"
const VANILLA_FAST_MODEL = "grok-composer-2.5-fast"
const VANILLA_REASONING_MODEL = "grok-4.20-0309-reasoning"
const VANILLA_CODING_MODEL = "grok-composer-2.5-fast"

const FASTISH_VANILLA_AGENTS = new Set(["explorer", "librarian", "quick", "unspecified-low", "sisyphus-junior"])
const CODING_VANILLA_AGENTS = new Set(["coding", "builder", "grok-build"])
const DEFAULT_VANILLA_AGENTS = new Set(["default", "sisyphus", "sisyphus-junior", "ulw"])

function isUsableVanillaGrokModel(model: string | undefined): boolean {
  // Now fully supports grok-3 family for vanilla (dynamic selection prefers grok-4 > grok-3)
  return isGrokModel(model)
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
  // Dynamic selection from real discovery (OAuth-enabled xAI models) for true vanilla optimization
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

  // Use dynamic best models where possible, fallback to role logic
  const explorerModel = best.fast
  const reasoningModel = best.reasoning
  const codingModel = best.coding
  const defaultModel = best.default

  // Minimal agent overrides for vanilla (only essential roles to reduce "all that stuff")
  const agentOverrideMap: Record<string, LazycodexAgentModelOverride> = {}
  const essentialRoles = ["explorer", "reasoning", "coding", "default", "ulw"]
  for (const name of essentialRoles) {
    if (bundled[name]) {
      const model = name === "explorer" ? explorerModel : name === "reasoning" ? reasoningModel : codingModel
      const override = bundled[name]
      const { modelFallback, modelFallbackReasoningLevel, modelFallbackServiceTier, ...rest } = override
      agentOverrideMap[name] = {
        ...rest,
        model,
        ...(isUsableVanillaGrokModel(modelFallback) ? { modelFallback } : {}),
        ...(isUsableVanillaGrokModel(modelFallback) && modelFallbackReasoningLevel !== undefined ? { modelFallbackReasoningLevel } : {}),
        ...(isUsableVanillaGrokModel(modelFallback) && modelFallbackServiceTier !== undefined ? { modelFallbackServiceTier } : {}),
      }
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
    agentOverrideMap,
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
    "Vanilla GrokBuild with xAI OAuth: uses native models from discovery (grok-4 preferred, grok-3 for fast).",
    `default: ${config.mapping.default}`,
    `fast: ${config.mapping.fast}`,
    `reasoning: ${config.mapping.reasoning}`,
    `coding: ${config.mapping.coding}`,
    "",
    "Minimal overrides for essential roles only. Re-run with proxy for full custom routing.",
  ].join("\n")
}

const VANILLA_RESULTS_ORDER = [
  "explorer",
  "reasoning",
  "coding",
  "default",
  "sisyphus",
  "prometheus",
  "librarian",
  "plan",
  "metis",
  "momus",
  "codex-ultrawork-reviewer",
] as const

/** Per-agent results listing for the vanilla path, matching the proxy path's "Setup results" shape. */
export function formatVanillaResults(config: VanillaGrokConfig): string {
  const tierOf = (o: LazycodexAgentModelOverride): string => o.serviceTier ?? "default"
  const names = [...new Set<string>([...VANILLA_RESULTS_ORDER, ...Object.keys(config.agentOverrideMap)])]
  return names
    .filter((name) => config.agentOverrideMap[name] !== undefined)
    .map((name) => {
      const override = config.agentOverrideMap[name]
      return `  ${name}: ${override.model} / ${override.reasoningLevel} (tier: ${tierOf(override)})`
    })
    .join("\n")
}
