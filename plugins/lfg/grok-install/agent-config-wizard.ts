type LineReader = AsyncIterator<string> & { readonly close: () => void }
import type { LazycodexAgentConfig, ModelDiscovery, ReasoningLevel } from "../bin/lfg-models"
import { ROLE_RECOMMENDATIONS, PERF_SNAPSHOT } from "./model-recommendations"
import {
  CONFIGURABLE_LAZYCODEX_AGENT_NAMES,
  type LazycodexAgentOverrideMap,
  type LazycodexAgentModelOverride,
  loadBundledDefaultOmoOverrides,
  mergeLazycodexAgentOverrides,
} from "./lazycodex-agent-overrides"

const ROLE_AGENTS = new Set(["explorer", "reasoning", "coding"])

export type AgentWizardOptions = {
  readonly modelSelector?: (spec: { agentName?: string; current: string; choices: Array<{ value: string; label: string; aliases: readonly string[]; key: string }> }) => Promise<string>;
  readonly tierSelector?: (spec: { agentName?: string; current: string }) => Promise<string>;
  readonly reasoningSelector?: (spec: { agentName?: string; current: string }) => Promise<string>;
};

/** LFP-style per-agent model prompts for OMO agents beyond the three role defaults. */
export async function configureOmoAgentOverridesInteractively(
  reader: LineReader,
  discovery: ModelDiscovery,
  roleConfig: LazycodexAgentConfig,
  writeLine: (text: string) => void,
  confirm: (reader: LineReader, prompt: string) => Promise<boolean>,
  options: AgentWizardOptions = {},
): Promise<LazycodexAgentOverrideMap> {
  const bundled = await loadBundledDefaultOmoOverrides()
  const base = mergeLazycodexAgentOverrides(roleConfig, bundled, {})
  // TUI path (or explicit skip) must never ask the long-tail "other agents" question.
  if ((options as any).skipOtherAgents === true) {
    return base
  }
  const shouldConfigure = await confirm(reader, "Configure other LazyCodex agents (librarian, plan, …)? [y/N] ")
  if (!shouldConfigure) {
    return base
  }
  writeLine("\nLazyCodex per-agent configuration (like LFP agent-config)\n")
  writeLine(`Available models: ${discovery.modelIds.join(", ")}\n`)
  const out: Record<string, LazycodexAgentModelOverride> = { ...base }
  for (const agentName of CONFIGURABLE_LAZYCODEX_AGENT_NAMES) {
    if (ROLE_AGENTS.has(agentName)) {
      continue
    }
    const rec = ROLE_RECOMMENDATIONS.find((r) => r.role === agentName)
    if (rec !== undefined) {
      const perf = PERF_SNAPSHOT[rec.recommended]
      const latency = perf ? `${perf.latencyMs}ms` : ""
      const tps = perf ? `${perf.tokensPerSec}t/s` : ""
      writeLine(`  Recommended: ${rec.recommended} (${latency}, ${tps}) - ${rec.rationale.split(".")[0]}\n`)
      const alts = rec.alternatives.filter((a) => discovery.modelIds.includes(a))
      if (alts.length > 0) {
        writeLine(`  Alternatives: ${alts.join(", ")}\n`)
      }
    }
    const current = out[agentName] ?? bundled[agentName]
    // LFP-style "Current" + "press Enter to keep" guidance
    const currentModel = current?.model ?? discovery.mapping.default
    const currentReasoning = current?.reasoningLevel ?? "medium"
    writeLine(`  Current: ${currentModel} (reasoning: ${currentReasoning})\n`)
    writeLine("  Default: keep the current LazyCodex/OMO value; press Enter to leave it unchanged.\n")
    const change = await confirm(reader, `  Configure ${agentName}? [y/N] `)
    if (!change) {
      continue
    }
    const defaultModel = current?.model ?? discovery.mapping.default
    const defaultReasoning = current?.reasoningLevel ?? "medium"
    const model = await readModelChoice(reader, discovery, writeLine, `  ${agentName} model [${defaultModel}]: `, defaultModel, options.modelSelector)
    // Tier for UX parity (not stored in core Grok overrides, but shown in transcript)
    const tier = await readTierChoice(reader, writeLine, `  ${agentName} service tier [default]: `, "default", options.tierSelector)
    const reasoningLevel = await readReasoningLevel(reader, writeLine, `  ${agentName} reasoning [${defaultReasoning}]: `, defaultReasoning, options.reasoningSelector)
    writeLine(`  ${agentName}: ${model} / ${reasoningLevel}${tier ? ` (tier: ${tier})` : ""}\n`)
    out[agentName] = { model, reasoningLevel }
  }
  return out
}

async function readModelChoice(
  reader: LineReader,
  discovery: ModelDiscovery,
  writeLine: (text: string) => void,
  prompt: string,
  fallback: string,
  modelSelector?: (spec: { agentName?: string; current: string; choices: Array<{ value: string; label: string; aliases: readonly string[]; key: string }> }) => Promise<string>,
): Promise<string> {
  if (typeof modelSelector === "function") {
    const choices = buildModelChoices(discovery.modelIds)
    const selected = await modelSelector({
      current: fallback,
      choices: choices.map((c) => ({ ...c, label: formatModelChoiceLabel(c) })),
    })
    return selected ?? fallback
  }
  writeLine(prompt)
  const answer = await reader.next()
  const value = answer.done === true ? "" : answer.value.trim()
  if (value.length === 0) {
    return fallback
  }
  if (discovery.modelIds.includes(value)) {
    return value
  }
  writeLine(`  Unknown model "${value}". Using ${fallback}.\n`)
  return fallback
}

async function readReasoningLevel(
  reader: LineReader,
  writeLine: (text: string) => void,
  prompt: string,
  fallback: ReasoningLevel,
  reasoningSelector?: (spec: { agentName?: string; current: string }) => Promise<string>,
): Promise<ReasoningLevel> {
  if (typeof reasoningSelector === "function") {
    const selected = await reasoningSelector({ current: fallback })
    return (isReasoningLevel(selected) ? selected : fallback) as ReasoningLevel
  }
  writeLine(prompt)
  const answer = await reader.next()
  const value = answer.done === true ? "" : answer.value.trim().toLowerCase()
  if (isReasoningLevel(value)) {
    return value
  }
  if (value.length > 0) {
    writeLine(`  Unknown reasoning level "${value}". Using ${fallback}.\n`)
  }
  return fallback
}

async function readTierChoice(
  reader: LineReader,
  writeLine: (text: string) => void,
  prompt: string,
  fallback: string,
  tierSelector?: (spec: { agentName?: string; current: string }) => Promise<string>,
): Promise<string> {
  if (typeof tierSelector === "function") {
    const selected = await tierSelector({ current: fallback })
    return selected ?? fallback
  }
  writeLine(prompt)
  const answer = await reader.next()
  const value = answer.done === true ? "" : answer.value.trim().toLowerCase()
  if (value.length === 0) return fallback
  if (["default", "fast"].includes(value)) return value
  if (value === "1") return "default"
  if (value === "2") return "fast"
  writeLine(`  Unknown tier "${value}". Using ${fallback}.\n`)
  return fallback
}

function buildModelChoices(models: readonly string[]) {
  const groups = new Map<string, string[]>()
  for (const m of models) {
    const key = m.split("/").at(-1) ?? m
    const arr = groups.get(key) ?? []
    arr.push(m)
    groups.set(key, arr)
  }
  return [...groups.entries()].map(([key, aliases]) => {
    const unique = [...new Set(aliases)].sort((a, b) => a.localeCompare(b))
    const value = unique.find((a) => a === key) ?? unique.find((a) => a === `openai/${key}`) ?? unique[0]
    return { key, aliases: unique, value }
  })
}

function formatModelChoiceLabel(choice: { key: string; aliases: readonly string[] }) {
  return choice.aliases.length === 1 ? choice.aliases[0] : `${choice.key} (aliases: ${choice.aliases.join(", ")})`
}

function isReasoningLevel(value: string): value is ReasoningLevel {
  return value === "low" || value === "medium" || value === "high" || value === "xhigh"
}