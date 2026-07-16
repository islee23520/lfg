import { defaultLazycodexAgentConfig, type ModelDiscovery, type SetupPreset } from "../models/lfg-models"
import type { LazycodexAgentOverrideMap } from "../../grok/agents/lazycodex-agent-overrides"
import type { AgentTuiResult } from "./lfg-setup-tui-agents"
import { formatCodingToolAdapterSummary } from "./lfg-setup-tui-adapter"
import type { CodingToolAdapterId } from "../../shared/coding-tool-adapter"
import type { BackendRoutingConfig } from "../../core/lfg/backend-routing"

export function formatIntroNote(configOnly: boolean): string {
  return configOnly
    ? [
        "Refresh thin LFG install settings under ~/.grok (plugin enablement + hooks).",
        "Does not reintroduce multi-agent or fat model tables into config.toml.",
        "Saving re-runs the idempotent Grok adapter sync.",
      ].join("\n")
    : [
        "Install the lfg Grok adapter: Sisyphus CEO on Grok, implementer on Codex App.",
        "Requires Codex CLI — setup checks it first and aborts without modifying Grok when it is absent.",
        "Sisyphus hands work to Codex App threads (app-server); Grok does not self-implement.",
        "Target: ~/.grok/plugins/lfg as a real directory.",
        "Writes: hooks, Sisyphus agent surface, thin plugin enablement — not fat subagent maps.",
      ].join("\n")
}

export function formatInstallSummary(input: {
  readonly configOnly: boolean
  readonly adapterChoice: CodingToolAdapterId
  readonly installGlobalCli: boolean
  readonly modelConfigLine: string
  readonly backendRouting: BackendRoutingConfig
}): string {
  const implementer = input.backendRouting.global === "codex" ? "Codex App (app-server threads)" : "external CLI backend"
  return [
    input.configOnly ? "Config path: ~/.grok" : "Install path: grok",
    input.configOnly ? "Updater: idempotent lfg Grok config sync" : "Installer: @islee23520/lfg internal grok-install",
    formatCodingToolAdapterSummary(input.adapterChoice),
    `CEO: Sisyphus on Grok; implementer: ${implementer}`,
    input.configOnly ? "Global CLI: unchanged" : `Global CLI: ${input.installGlobalCli ? "install/update with npm -g" : "skip"}`,
    input.modelConfigLine,
    "Writes: hooks, Sisyphus-only agent, thin plugins enablement, lfg-backend-routing.json",
    "Does not write fat subagents.* / multi-agent tables / model.grok-build into config.toml",
    "",
    "Include ultrawork (or ulw) in prompts for deep Codex execution until completion.",
    "Product work uses lfg handoff / plan goal → Codex App threads, not Grok subagents.",
  ].join("\n")
}

export function formatPresetResults(preset: SetupPreset, discovery: ModelDiscovery): string {
  return [
    `Preset: ${preset}`,
    `  default: ${discovery.mapping.default}`,
    `  fast: ${discovery.mapping.fast}`,
    `  reasoning: ${discovery.mapping.reasoning}`,
    `  coding: ${discovery.mapping.coding}`,
    "Sisyphus-only profile will be installed; product work runs in Codex App.",
  ].join("\n")
}

export function formatRecommendedResults(discovery: ModelDiscovery, _bundled: LazycodexAgentOverrideMap): string {
  return [
    "LLM recommendation: auto",
    `  default: ${discovery.mapping.default}`,
    `  fast: ${discovery.mapping.fast}`,
    `  reasoning: ${discovery.mapping.reasoning}`,
    `  coding: ${discovery.mapping.coding}`,
    "Sisyphus-only profile will be installed; product work runs in Codex App.",
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
    "Legacy role labels (discovery mapping only — not Grok subagents):",
    `  explorer: ${agents.explorer.model} / ${agents.explorer.reasoningLevel}`,
    `  reasoning: ${agents.reasoning.model} / ${agents.reasoning.reasoningLevel}`,
    `  coding: ${agents.coding.model} / ${agents.coding.reasoningLevel}`,
    ...extraLines,
  ].join("\n")
}
