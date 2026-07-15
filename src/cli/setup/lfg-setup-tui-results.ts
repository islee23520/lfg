import { defaultLazycodexAgentConfig, type ModelDiscovery, type SetupPreset } from "../models/lfg-models"
import type { LazycodexAgentOverrideMap } from "../../grok/agents/lazycodex-agent-overrides"
import type { AgentTuiResult } from "./lfg-setup-tui-agents"
import { formatCodingToolAdapterSummary } from "./lfg-setup-tui-adapter"
import type { CodingToolAdapterId } from "../../shared/coding-tool-adapter"
import type { BackendRoutingConfig } from "../../core/lfg/backend-routing"
import { BACKEND_ROUTE_AGENT_NAMES } from "../../core/lfg/backend-routing"

export function formatIntroNote(configOnly: boolean): string {
  return configOnly
    ? [
        "Edit LFG model routing from discovered proxy models.",
        "Automatic routing uses the discovered model catalog.",
        "Saving re-runs the idempotent Grok adapter sync so settings land in ~/.grok.",
      ].join("\n")
    : [
        "Install the lfg Grok adapter (watcher) that hands work directly to Codex.",
        "Requires Codex CLI — setup checks it first and aborts without modifying Grok when it is absent.",
        "Sisyphus creates a handoff plan and launches the returned Codex argv directly.",
        "Target: ~/.grok/plugins/lfg as a real directory.",
        "Apply Grok adapter, hooks, agents, and model overrides.",
      ].join("\n")
}

export function formatInstallSummary(input: {
  readonly configOnly: boolean
  readonly adapterChoice: CodingToolAdapterId
  readonly installGlobalCli: boolean
  readonly modelConfigLine: string
  readonly backendRouting: BackendRoutingConfig
}): string {
  return [
    input.configOnly ? "Config path: ~/.grok" : "Install path: grok",
    input.configOnly ? "Updater: idempotent lfg Grok config sync" : "Installer: @islee23520/lfg internal grok-install",
    formatCodingToolAdapterSummary(input.adapterChoice),
    `CLI backend routing: default ${input.backendRouting.global}; ${BACKEND_ROUTE_AGENT_NAMES.map((name) => `${name}=${input.backendRouting.agents[name]}`).join(", ")}`,
    input.configOnly ? "Global CLI: unchanged" : `Global CLI: ${input.installGlobalCli ? "install/update with npm -g" : "skip"}`,
    input.modelConfigLine,
    "Writes: hooks, agents, overrides, lfg config, Grok plugin enablement",
    "",
    "Include ultrawork (or ulw) in your prompt to unlock deep exploration, parallel agents,",
    "background work, and relentless execution until completion.",
  ].join("\n")
}

export function formatPresetResults(preset: SetupPreset, discovery: ModelDiscovery): string {
  return [
    `Preset: ${preset}`,
    `  default: ${discovery.mapping.default}`,
    `  fast: ${discovery.mapping.fast}`,
    `  reasoning: ${discovery.mapping.reasoning}`,
    `  coding: ${discovery.mapping.coding}`,
    "Bundled routing profiles remain enabled. Advanced details: ~/.grok/omo-agent-overrides.json",
  ].join("\n")
}

export function formatRecommendedResults(discovery: ModelDiscovery, bundled: LazycodexAgentOverrideMap): string {
  return [
    "LLM recommendation: auto",
    `  default: ${discovery.mapping.default}`,
    `  fast: ${discovery.mapping.fast}`,
    `  reasoning: ${discovery.mapping.reasoning}`,
    `  coding: ${discovery.mapping.coding}`,
    `${Object.keys(bundled).length} bundled routing profiles will be installed.`,
    "Advanced details: ~/.grok/omo-agent-overrides.json",
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
