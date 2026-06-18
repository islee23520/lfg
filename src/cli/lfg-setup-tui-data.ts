import { isRecord } from "./lfg-json"
import type { LazycodexAgentConfig, ModelDiscovery, ReasoningLevel } from "./lfg-models"
import type { LazycodexAgentModelOverride, LazycodexAgentOverrideMap } from "../grok-adapter/lazycodex-agent-overrides"
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

/** True for Grok-native model ids (the "vanilla Grok" surface). */
export function isGrokModel(model: string | undefined): boolean {
  return typeof model === "string" && (/^grok[-_/]/i.test(model) || model === "grok-build")
}

/** Pick a Grok model: prefer the primary if Grok, else the fallback if Grok, else a role default. */
export function pickGrokModel(primary: string | undefined, fallback: string | undefined, roleDefault: string): string {
  if (isGrokModel(primary)) return primary as string
  if (isGrokModel(fallback)) return fallback as string
  return roleDefault
}

export type VanillaGrokConfig = {
  readonly agentConfig: LazycodexAgentConfig
  readonly agentOverrideMap: LazycodexAgentOverrideMap
  readonly mapping: { readonly default: string; readonly fast: string; readonly reasoning: string; readonly coding: string }
}

const FASTISH_VANILLA_AGENTS = new Set(["explorer", "librarian", "quick", "unspecified-low", "sisyphus-junior"])

/**
 * Build the "vanilla Grok models" config: every agent resolves to a Grok-native model with no
 * proxy discovery and no per-agent selection. Uses the grok-first role profiles
 * (getAgentRecommendation with no availability constraint), and for agents without a profile
 * prefers the Grok fallback in the bundled override.
 */
export function buildVanillaGrokConfig(bundled: LazycodexAgentOverrideMap): VanillaGrokConfig {
  const grokFor = (name: string, fallbackDefault: string): string => {
    const rec = getAgentRecommendation(name, [], undefined)
    if (rec !== null && isGrokModel(rec.recommended)) {
      return rec.recommended
    }
    const override = bundled[name]
    return pickGrokModel(override?.model, override?.modelFallback, fallbackDefault)
  }
  const explorerModel = grokFor("explorer", "grok-3-mini-fast")
  const reasoningModel = grokFor("reasoning", "grok-4.20-0309-reasoning")
  const codingModel = grokFor("coding", "grok-4.20-0309-non-reasoning")
  const defaultModel = grokFor("default", reasoningModel)

  const agentOverrideMap: Record<string, LazycodexAgentModelOverride> = {}
  for (const [name, override] of Object.entries(bundled)) {
    const model = grokFor(name, FASTISH_VANILLA_AGENTS.has(name) ? explorerModel : reasoningModel)
    agentOverrideMap[name] = { ...override, model }
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

/** Short human note shown in the vanilla path before the install summary. */
export function formatVanillaSummary(config: VanillaGrokConfig): string {
  return [
    "Using built-in Grok models directly (no cli-proxy discovery, no per-agent selection).",
    `default: ${config.mapping.default}`,
    `fast: ${config.mapping.fast}`,
    `reasoning: ${config.mapping.reasoning}`,
    `coding: ${config.mapping.coding}`,
    "",
    "Per-agent models are pinned to Grok. Re-run setup and choose cli-proxy to tune them.",
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
