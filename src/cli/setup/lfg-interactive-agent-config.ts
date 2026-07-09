import { stdout as output } from "node:process"
import {
  defaultLazycodexAgentConfig,
  type LazycodexAgentConfig,
  type LazycodexAgentName,
  type ModelDiscovery,
  type ReasoningLevel,
} from "../models/lfg-models"
import {
  defaultTierPromptForAgent,
  resolveModelForServiceTier,
  serviceTierFromChoice,
} from "../models/resolve-tier-model"
import { buildRoleRecommendations, PERF_SNAPSHOT } from "../../grok/models/model-recommendations"
import type { LazycodexAgentOverrideMap } from "../../grok/agents/lazycodex-agent-overrides"
import { logAgentGuide } from "./model-config-prompts"

type LineReader = AsyncIterator<string> & { readonly close: () => void }

type AgentSelectorOptions = {
  readonly modelSelector?: (spec: { agentName?: string; current: string; choices: Array<{ value: string; label: string; aliases: readonly string[]; key: string }> }) => Promise<string>;
  readonly tierSelector?: (spec: { agentName?: string; current: string }) => Promise<string>;
  readonly reasoningSelector?: (spec: { agentName?: string; current: string }) => Promise<string>;
  readonly skipFinalGate?: boolean;
  readonly skipOtherAgents?: boolean;
}

export async function loadBundledDefaultOmoOverridesForInteractive(): Promise<LazycodexAgentOverrideMap> {
  const mod = await import("../../grok/agents/lazycodex-agent-overrides.js")
  return mod.loadBundledDefaultOmoOverrides()
}

export async function mergeLazycodexAgentOverrides(
  roleConfig: LazycodexAgentConfig,
  bundled: LazycodexAgentOverrideMap,
  extra: LazycodexAgentOverrideMap,
): Promise<LazycodexAgentOverrideMap> {
  const mod = await import("../../grok/agents/lazycodex-agent-overrides.js")
  return mod.mergeLazycodexAgentOverrides(roleConfig, bundled, extra)
}

export function fallbackModelDiscovery(): ModelDiscovery {
  const mapping = {
    default: "grok-build",
    fast: "grok-build",
    reasoning: "grok-build",
    coding: "grok-build",
  }
  return {
    baseUrl: "",
    modelsUrl: "",
    modelIds: ["grok-build"],
    mapping,
  }
}

export async function readAgentConfig(
  reader: LineReader,
  discovery: ModelDiscovery,
  options: AgentSelectorOptions = {},
): Promise<LazycodexAgentConfig> {
  const defaults = defaultLazycodexAgentConfig(discovery)
  return {
    explorer: await readAgentSetting(reader, discovery, "explorer", defaults.explorer.model, defaults.explorer.reasoningLevel, options),
    reasoning: await readAgentSetting(reader, discovery, "reasoning", defaults.reasoning.model, defaults.reasoning.reasoningLevel, options),
    coding: await readAgentSetting(reader, discovery, "coding", defaults.coding.model, defaults.coding.reasoningLevel, options),
  }
}

async function readAgentSetting(
  reader: LineReader,
  discovery: ModelDiscovery,
  agentName: LazycodexAgentName,
  defaultModel: string,
  defaultReasoningLevel: ReasoningLevel,
  options: AgentSelectorOptions = {},
) {
  const isTui =
    options.modelSelector !== undefined ||
    options.tierSelector !== undefined ||
    options.reasoningSelector !== undefined ||
    options.skipFinalGate === true ||
    options.skipOtherAgents === true

  if (!isTui) {
    const rec = buildRoleRecommendations(discovery.modelIds).find((r) => r.role === agentName)
    if (rec !== undefined) {
      const perf = PERF_SNAPSHOT[rec.recommended]
      const perfLine =
        perf !== undefined ? `(${perf.latencyMs}ms, ${perf.tokensPerSec}t/s)` : undefined
      const alts = rec.alternatives.filter((a) => discovery.modelIds.includes(a))
      logAgentGuide(
        { write: (chunk) => output.write(chunk) },
        agentName,
        {
          model: defaultModel,
          reasoning: defaultReasoningLevel,
          tier: defaultTierPromptForAgent(agentName),
        },
        {
          recommended: rec.recommended,
          rationale: rec.rationale,
          alternatives: alts,
          ...(perfLine !== undefined ? { perfLine } : {}),
        },
      )
    } else {
      logAgentGuide(
        { write: (chunk) => output.write(chunk) },
        agentName,
        {
          model: defaultModel,
          reasoning: defaultReasoningLevel,
          tier: defaultTierPromptForAgent(agentName),
        },
        { preferCurrent: true },
      )
    }
  }

  const picked = await readModelChoice(reader, discovery, `  ${agentName} model [${defaultModel}]: `, defaultModel, agentName, options.modelSelector)
  const tierDefault = defaultTierPromptForAgent(agentName)
  const tier =
    typeof options.tierSelector === "function"
      ? await readTierChoice(reader, `  ${agentName} service tier [${tierDefault}]: `, tierDefault, agentName, options.tierSelector)
      : undefined
  const model =
    tier !== undefined
      ? resolveModelForServiceTier(discovery.modelIds, picked, tier, {
          mappingFast: discovery.mapping.fast,
          mappingDefault: discovery.mapping.default,
        })
      : picked
  const reasoningLevel = await readReasoningLevel(reader, `  ${agentName} reasoning level [${defaultReasoningLevel}]: `, defaultReasoningLevel, agentName, options.reasoningSelector)
  output.write(`  ${agentName}: ${model} / ${reasoningLevel}${tier ? ` (tier: ${tier})` : ""}\n`)
  return {
    model,
    reasoningLevel,
    ...(tier !== undefined ? { serviceTier: serviceTierFromChoice(tier) } : {}),
  }
}

async function readTierChoice(
  reader: LineReader,
  prompt: string,
  fallback: string,
  agentName: string,
  tierSelector?: (spec: { agentName?: string; current: string }) => Promise<string>,
): Promise<string> {
  if (typeof tierSelector === "function") {
    const selected = await tierSelector({ agentName, current: fallback })
    return selected ?? fallback
  }
  output.write(prompt)
  const answer = await reader.next()
  const value = answer.done === true ? "" : answer.value.trim().toLowerCase()
  if (value.length === 0) return fallback
  if (["default", "fast"].includes(value)) return value
  if (value === "1") return "default"
  if (value === "2") return "fast"
  output.write(`  Unknown tier "${value}". Using ${fallback}.\n`)
  return fallback
}

async function readModelChoice(
  reader: LineReader,
  discovery: ModelDiscovery,
  prompt: string,
  fallback: string,
  agentName: string,
  modelSelector?: (spec: { agentName?: string; current: string; choices: Array<{ value: string; label: string; aliases: readonly string[]; key: string }> }) => Promise<string>,
): Promise<string> {
  if (typeof modelSelector === "function") {
    const choices = buildModelChoices(discovery.modelIds)
    const selected = await modelSelector({
      agentName,
      current: fallback,
      choices: choices.map((c) => ({ ...c, label: formatModelChoiceLabel(c) })),
    })
    return selected ?? fallback
  }
  output.write(prompt)
  const answer = await reader.next()
  const value = answer.done === true ? "" : answer.value.trim()
  if (value.length === 0) {
    return fallback
  }
  if (discovery.modelIds.includes(value)) {
    return value
  }
  output.write(`  Unknown model "${value}". Using ${fallback}.\n`)
  return fallback
}

async function readReasoningLevel(
  reader: LineReader,
  prompt: string,
  fallback: ReasoningLevel,
  agentName: string,
  reasoningSelector?: (spec: { agentName?: string; current: string }) => Promise<string>,
): Promise<ReasoningLevel> {
  if (typeof reasoningSelector === "function") {
    const selected = await reasoningSelector({ agentName, current: fallback })
    return isReasoningLevel(selected) ? selected : fallback
  }
  output.write(prompt)
  const answer = await reader.next()
  const value = answer.done === true ? "" : answer.value.trim().toLowerCase()
  if (isReasoningLevel(value)) {
    return value
  }
  if (value.length > 0) {
    output.write(`  Unknown reasoning level "${value}". Using ${fallback}.\n`)
  }
  return fallback
}

function buildModelChoices(models: readonly string[]) {
  const groups = new Map<string, string[]>()
  for (const model of models) {
    const key = model.split("/").at(-1) ?? model
    const aliases = groups.get(key) ?? []
    aliases.push(model)
    groups.set(key, aliases)
  }
  return [...groups.entries()].map(([key, aliases]) => {
    const unique = [...new Set(aliases)].sort((a, b) => a.localeCompare(b))
    const value = unique.find((alias) => alias === key) ?? unique.find((alias) => alias === `openai/${key}`) ?? unique[0] ?? key
    return { key, aliases: unique, value }
  })
}

function formatModelChoiceLabel(choice: { readonly key: string; readonly aliases: readonly string[] }) {
  return choice.aliases.length === 1 ? choice.aliases[0] : `${choice.key} (aliases: ${choice.aliases.join(", ")})`
}

function isReasoningLevel(value: string): value is ReasoningLevel {
  return value === "low" || value === "medium" || value === "high" || value === "xhigh"
}
