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

/** LFP-style per-agent model prompts for OMO agents beyond the three role defaults. */
export async function configureOmoAgentOverridesInteractively(
  reader: LineReader,
  discovery: ModelDiscovery,
  roleConfig: LazycodexAgentConfig,
  writeLine: (text: string) => void,
  confirm: (reader: LineReader, prompt: string) => Promise<boolean>,
): Promise<LazycodexAgentOverrideMap> {
  const bundled = await loadBundledDefaultOmoOverrides()
  const base = mergeLazycodexAgentOverrides(roleConfig, bundled, {})
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
    const change = await confirm(reader, `  Configure ${agentName}? [y/N] `)
    if (!change) {
      continue
    }
    const defaultModel = current?.model ?? discovery.mapping.default
    const defaultReasoning = current?.reasoningLevel ?? "medium"
    const model = await readModelChoice(reader, discovery, writeLine, `  ${agentName} model [${defaultModel}]: `, defaultModel)
    const reasoningLevel = await readReasoningLevel(reader, writeLine, `  ${agentName} reasoning [${defaultReasoning}]: `, defaultReasoning)
    writeLine(`  ${agentName}: ${model} / ${reasoningLevel}\n`)
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
): Promise<string> {
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
): Promise<ReasoningLevel> {
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

function isReasoningLevel(value: string): value is ReasoningLevel {
  return value === "low" || value === "medium" || value === "high" || value === "xhigh"
}