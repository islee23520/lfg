import { defaultLazycodexAgentConfig, type ModelDiscovery, type SetupPreset } from "../models/lfg-models"
import type { LazycodexAgentOverrideMap } from "../../grok/agents/lazycodex-agent-overrides"
import { formatRecommendationTable } from "../../grok/models/model-recommendations"
import type { AgentTuiResult } from "./lfg-setup-tui-agents"
import { formatCodingToolAdapterSummary } from "./lfg-setup-tui-adapter"
import { toRecommendationOverrideMap } from "./lfg-setup-tui-data"
import type { CodingToolAdapterId } from "../../shared/coding-tool-adapter"

export function formatIntroNote(configOnly: boolean): string {
  return configOnly
    ? [
        "Edit LFG model routing from discovered proxy models.",
        "Auto routing prefers GPT/GLM for orchestration, Composer for coding, and Gemini for visual agents.",
        "Saving re-runs the idempotent Grok adapter sync so settings land in ~/.grok.",
      ].join("\n")
    : [
        "Install the omo/lazycodex adapter for Grok Build.",
        "Target: ~/.grok/plugins/lfg as a real directory.",
        "Codex-home bootstrap is not used.",
        "Apply Grok adapter, hooks, agents, and model overrides from discovered proxy.",
      ].join("\n")
}

export function formatInstallSummary(input: {
  readonly configOnly: boolean
  readonly adapterChoice: CodingToolAdapterId
  readonly installGlobalCli: boolean
  readonly modelConfigLine: string
}): string {
  return [
    input.configOnly ? "Config path: ~/.grok" : "Install path: grok",
    input.configOnly ? "Updater: idempotent lfg Grok config sync" : "Installer: @islee23520/lfg internal grok-install",
    formatCodingToolAdapterSummary(input.adapterChoice),
    input.configOnly ? "Global CLI: unchanged" : `Global CLI: ${input.installGlobalCli ? "install/update with npm -g" : "skip"}`,
    input.modelConfigLine,
    "Writes: hooks, agents, overrides, lfg config, Grok plugin enablement",
    "",
    "Include ultrawork (or ulw) in your prompt to unlock deep exploration, parallel agents,",
    "background work, and relentless execution until completion.",
  ].join("\n")
}

export function formatPresetResults(preset: SetupPreset, discovery: ModelDiscovery): string {
  const agents = defaultLazycodexAgentConfig(discovery)
  return [
    `Preset: ${preset}`,
    `  default: ${discovery.mapping.default}`,
    `  fast: ${discovery.mapping.fast}`,
    `  reasoning: ${discovery.mapping.reasoning}`,
    `  coding: ${discovery.mapping.coding}`,
    "",
    "Agent routing is derived from the global preset:",
    `  explorer: ${agents.explorer.model} / ${agents.explorer.reasoningLevel}`,
    `  reasoning: ${agents.reasoning.model} / ${agents.reasoning.reasoningLevel}`,
    `  coding: ${agents.coding.model} / ${agents.coding.reasoningLevel}`,
  ].join("\n")
}

export function formatRecommendedResults(discovery: ModelDiscovery, bundled: LazycodexAgentOverrideMap): string {
  return [
    formatPresetResults("auto", discovery).replace("Preset: auto", "LLM recommendation: auto"),
    "",
    formatRecommendationTable(discovery.modelIds, toRecommendationOverrideMap(bundled), { condensed: true }),
  ].join("\n")
}

export function formatCustomResults(
  preset: SetupPreset,
  discovery: ModelDiscovery,
  roleResults: readonly AgentTuiResult[],
  agents: ReturnType<typeof defaultLazycodexAgentConfig>,
  extraResults: readonly AgentTuiResult[] = [],
): string {
  const extraLines = extraResults.length === 0
    ? []
    : ["", "Named agent overrides (customized):", ...extraResults.map((agent) => `  ${agent.name}: ${agent.model} / ${agent.reasoning} (tier: ${agent.tier})`)]
  return [
    `Preset: ${preset} (customized roles)`,
    `  default: ${discovery.mapping.default}`,
    `  fast: ${discovery.mapping.fast}`,
    `  reasoning: ${discovery.mapping.reasoning}`,
    `  coding: ${discovery.mapping.coding}`,
    "",
    "Agent routing (customized):",
    `  explorer: ${agents.explorer.model} / ${agents.explorer.reasoningLevel}`,
    `  reasoning: ${agents.reasoning.model} / ${agents.reasoning.reasoningLevel}`,
    `  coding: ${agents.coding.model} / ${agents.coding.reasoningLevel}`,
    ...extraLines,
  ].join("\n")
}
