import * as clack from "@clack/prompts"

import type { LazycodexAgentConfig, ModelDiscovery, ReasoningLevel } from "../models/lfg-models"
import type { ModelChoice, ModelSelector, ReasoningSelector, TierSelector } from "./lfg-setup-tui-selectors"
import {
  formatAgentRecommendationBody,
  WHY_TWO_MODEL_STEPS_BODY,
  type RecommendationOverrideMap,
} from "./lfg-setup-tui-data"
import { defaultTierPromptForAgent, resolveModelForServiceTier, serviceTierFromChoice } from "../models/resolve-tier-model"
import {
  CONFIGURABLE_LAZYCODEX_AGENT_NAMES,
  mergeLazycodexAgentOverrides,
  type LazycodexAgentModelOverride,
  type LazycodexAgentOverrideMap,
} from "../../grok/agents/lazycodex-agent-overrides"
import { getAgentRecommendation } from "../../grok/models/model-recommendations"

export type AgentTuiResult = {
  readonly name: string
  readonly model: string
  readonly tier: string
  readonly reasoning: ReasoningLevel
}

export type AgentOverrideConfigResult = {
  readonly agentOverrideMap: LazycodexAgentOverrideMap
  readonly extraResults: readonly AgentTuiResult[]
}

export type SetupSelectorBundle = {
  readonly modelSelector: ModelSelector
  readonly tierSelector: TierSelector
  readonly reasoningSelector: ReasoningSelector
}

const ROLE_AGENT_NAMES = ["explorer", "reasoning", "coding"] as const
const ROLE_AGENT_NAME_SET = new Set<string>(ROLE_AGENT_NAMES)
const EXTRA_CORE_ULW_AGENT_NAMES = CONFIGURABLE_LAZYCODEX_AGENT_NAMES.filter((name) => !ROLE_AGENT_NAME_SET.has(name))

export async function configureRoleAgents(
  prompts: typeof clack,
  discovery: ModelDiscovery | null,
  choices: readonly ModelChoice[],
  selectors: SetupSelectorBundle,
  bundledOverrideMap: RecommendationOverrideMap,
): Promise<readonly [AgentTuiResult, AgentTuiResult, AgentTuiResult]> {
  const explorer = await configureAgent(prompts, discovery, "explorer", discovery?.mapping.fast ?? discovery?.mapping.default ?? "grok-3-mini-fast", "low", choices, selectors, bundledOverrideMap)
  const reasoning = await configureAgent(prompts, discovery, "reasoning", discovery?.mapping.reasoning ?? "grok-4.20-0309-reasoning", "high", choices, selectors, bundledOverrideMap)
  const coding = await configureAgent(prompts, discovery, "coding", discovery?.mapping.coding ?? "gpt-5.3-codex-spark", "medium", choices, selectors, bundledOverrideMap)
  return [explorer, reasoning, coding]
}

export async function configureAgentOverrides(
  prompts: typeof clack,
  discovery: ModelDiscovery | null,
  choices: readonly ModelChoice[],
  selectors: SetupSelectorBundle,
  roleResults: readonly AgentTuiResult[],
  roleConfig: LazycodexAgentConfig,
  bundled: LazycodexAgentOverrideMap,
  bundledRecommendationOverrides: RecommendationOverrideMap,
): Promise<AgentOverrideConfigResult> {
  const base = applyRoleTierToOverrides(mergeLazycodexAgentOverrides(roleConfig, bundled, {}), roleResults)
  prompts.note(WHY_TWO_MODEL_STEPS_BODY, "Why two model steps?")
  const shouldConfigure = await prompts.confirm({ message: "Customize Core + ULW named agent overrides?", initialValue: false })
  if (prompts.isCancel(shouldConfigure)) {
    prompts.cancel("lfg setup cancelled.")
    throw new Error("lfg setup cancelled")
  }
  if (shouldConfigure !== true) {
    return { agentOverrideMap: base, extraResults: [] }
  }
  const next: Record<string, LazycodexAgentModelOverride> = { ...base }
  const extraResults: AgentTuiResult[] = []
  for (const name of EXTRA_CORE_ULW_AGENT_NAMES) {
    const current = base[name] ?? { model: discovery?.mapping.default ?? "gpt-5.4-mini", reasoningLevel: "medium" }
    const result = await configureAgent(prompts, discovery, name, current.model, current.reasoningLevel, choices, selectors, bundledRecommendationOverrides)
    next[name] = {
      ...next[name],
      model: result.model,
      reasoningLevel: result.reasoning,
      serviceTier: serviceTierFromChoice(result.tier),
    }
    extraResults.push(result)
  }
  return { agentOverrideMap: next, extraResults }
}

export function resolveFastMappingSlot(
  discovery: ModelDiscovery,
  roleResults: readonly AgentTuiResult[],
  explorerModel: string,
): string {
  const explorer = roleResults.find((r) => r.name === "explorer")
  if (explorer !== undefined && explorer.tier === "fast") {
    return explorer.model
  }
  return discovery.mapping.fast.length > 0 ? discovery.mapping.fast : explorerModel
}

async function configureAgent(
  prompts: typeof clack,
  discovery: ModelDiscovery | null,
  name: string,
  currentModel: string,
  currentReasoning: ReasoningLevel,
  choices: readonly ModelChoice[],
  selectors: SetupSelectorBundle,
  bundledOverrideMap: RecommendationOverrideMap,
): Promise<AgentTuiResult> {
  const rec = getAgentRecommendation(name, discovery?.modelIds ?? [], bundledOverrideMap)
  if (rec !== null) {
    prompts.note(formatAgentRecommendationBody(rec), `${name} model recommendation`)
  }
  // Per-agent undo: after the three picks, offer a keep/redo confirm so a wrong selection can be
  // re-run for just this agent. The recommendation stays visible via the pinned selector message.
  for (;;) {
    const initialModel = selectInitialModel(currentModel, rec?.recommended, choices)
    const picked = await selectors.modelSelector({ agentName: name, current: initialModel, recommended: rec?.recommended, choices })
    const tier = await selectors.tierSelector({ agentName: name, current: defaultTierPromptForAgent(name) })
    const model = resolveModelForServiceTier(discovery?.modelIds ?? [], picked, tier, {
      mappingFast: discovery?.mapping.fast,
      mappingDefault: discovery?.mapping.default,
    })
    const reasoning = toReasoningLevel(await selectors.reasoningSelector({ agentName: name, current: currentReasoning }))
    console.log(`  ${name}: ${model} / ${reasoning} (tier: ${tier})`)
    const keep = await prompts.confirm({
      message: `Keep ${name} as ${model} / ${reasoning} (tier: ${tier})?`,
      initialValue: true,
    })
    if (prompts.isCancel(keep)) {
      prompts.cancel("lfg setup cancelled.")
      throw new Error("lfg setup cancelled")
    }
    if (keep) {
      return { name, model, tier, reasoning }
    }
    // redo this agent only; loop again
  }
}

function selectInitialModel(currentModel: string, recommended: string | undefined, choices: readonly ModelChoice[]): string {
  const currentChoice = matchingChoiceValue(currentModel, choices)
  if (currentChoice !== undefined) return currentChoice
  const recommendedChoice = recommended === undefined ? undefined : matchingChoiceValue(recommended, choices)
  if (recommendedChoice !== undefined) return recommendedChoice
  return choices[0]?.value ?? currentModel
}

function matchingChoiceValue(model: string, choices: readonly ModelChoice[]): string | undefined {
  const match = choices.find((choice) => choice.value === model || choice.key === model || choice.aliases.includes(model))
  return match?.value
}

function applyRoleTierToOverrides(
  map: LazycodexAgentOverrideMap,
  roleResults: readonly AgentTuiResult[],
): LazycodexAgentOverrideMap {
  const next: Record<string, LazycodexAgentModelOverride> = { ...map }
  for (const role of roleResults) {
    if (!ROLE_AGENT_NAME_SET.has(role.name)) continue
    const prev = next[role.name]
    next[role.name] = {
      ...prev,
      model: role.model,
      reasoningLevel: role.reasoning,
      serviceTier: serviceTierFromChoice(role.tier),
    }
  }
  return next
}

function toReasoningLevel(value: string): ReasoningLevel {
  if (value === "low" || value === "medium" || value === "high" || value === "xhigh") {
    return value
  }
  return "medium"
}
