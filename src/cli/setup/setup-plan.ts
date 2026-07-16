import { relative } from "node:path"
import { grokConfigJson, refreshGrokModelConfig } from "../config/lfg-grok-config"
import { defaultLazycodexAgentConfig, modelDiscoveryPlan, type ModelDiscovery, type SetupPreset } from "../models/lfg-models"
import { type JsonObject } from "../../shared/json"
import { buildGrokHostAdapterCapabilities } from "../../grok/adapter/grok-host-capabilities"
import { resolveGrokApiKey } from "../../grok/install/grok-api-key"
import { resolveGrokSetupHome } from "../../grok/install/grok-home"
import { INTERNAL_GROK_INSTALL_COMMAND } from "../../grok/install/run-grok-install"
import type { ResolveSetupDiscoveryResult } from "../../grok/install/resolve-setup-discovery"
import { codingToolAdapterSelectionJson, type CodingToolAdapterId } from "./coding-tool-adapter"
import { cliBackendSelectionJson, DEFAULT_CLI_BACKEND, type CliBackend } from "../../core/lfg/backend-routing"

export function setupPlan(resolved: ResolveSetupDiscoveryResult, preset: SetupPreset, codingToolAdapter?: CodingToolAdapterId, backendEngine: CliBackend = DEFAULT_CLI_BACKEND): JsonObject {
  const discovery = resolved.discovery
  const hostCapabilities = buildGrokHostAdapterCapabilities(resolveGrokSetupHome(process.env), discovery)
  const pluginPath = homeRelativePath(hostCapabilities.paths.pluginDirectory, hostCapabilities.paths.homeDirectory)
  return {
    ok: true,
    status: "planned",
    command: "setup",
    role: "omo_grok_installer",
    adapterPackage: "lfg-grok-install",
    companionPackage: "lfg-grok-install",
    installerCommand: INTERNAL_GROK_INSTALL_COMMAND,
    grokInstallerCommand: INTERNAL_GROK_INSTALL_COMMAND,
    lfpInstallerCommand: INTERNAL_GROK_INSTALL_COMMAND,
    packageExecutors: ["npx @islee23520/lfg"],
    selectedPreset: preset,
    presets: [
      { id: "auto", label: "Auto best available", text: "Choose the best Grok-first global model routes from the discovered catalog." },
      { id: "grok", label: "Grok-specialized", text: "Prefer Grok model ids for global routes." },
    ],
    executed: false,
    dryRun: false,
    lfgIsPlugin: false,
    installPath: hostCapabilities.name,
    codingToolAdapter: codingToolAdapterSelectionJson(codingToolAdapter),
    backendEngine: cliBackendSelectionJson(backendEngine),
    purpose: `Grok-first direct install of the OMO adapter into Grok Build. \`setup --run\` preserves a healthy stamped ${pluginPath} tree and syncs model config from discovered CLI proxy models. \`setup --run --force\` replaces the adapter tree as a real directory (including symlink/legacy cleanup). Supported hooks, Sisyphus, ultrawork context, ulw skills, agents, and manifest-only MCP entries are materialized under ${pluginPath}; deferred OMO components stay documented as deferred or unsupported.`,
    modelDiscovery: discovery ?? modelDiscoveryPlan(),
    ...(discovery === null ? {} : { agentReasoning: agentReasoningSummary(discovery) }),
    modelDiscoverySource: resolved.baseUrlSource,
    modelsBaseUrlUsed: resolved.baseUrlUsed,
    autoModelAliases: hostCapabilities.models.discoveredModels.length > 0,
    steps: [
      { id: 1, status: discovery === null ? "pending" : "done", text: "Discover models for vanilla Grok host auth (or optional --base-url proxy). Setup does not rewrite fat [model.*] alias tables into config.toml." },
      { id: 2, status: discovery === null ? "pending" : "done", text: "Map default/fast/reasoning/coding discovery buckets for Sisyphus-only CEO routing; product implementer remains Codex App (app-server threads)." },
      { id: 3, status: "pending", text: `Preserve or materialize via ${INTERNAL_GROK_INSTALL_COMMAND}: preserve healthy stamped ${pluginPath} unless --force is explicit; otherwise replace symlink/dirty/legacy entries with a real lfg directory from LFG_OMO_PLUGIN_SOURCE, the built-in native payload, or legacy fallback.` },
      { id: 4, status: "pending", text: "Post-install: enable plugins=lfg, normalize hooks, materialize Sisyphus-only agent/role, write lfg-backend-routing.json, strip fat subagents.* / multi-agent tables from config.toml. No Grok host subagent matrix." },
    ],
    note: `Grok-first. Default \`lfg setup\` (and --json setup) plans the supported lfg-owned OMO port under ${pluginPath}, including manifest-only MCP entries rather than behavior-adapted local MCP tools. Everything lives under ~/.grok as a real directory. Existing stamped lfg setups are preserved by setup --run unless --force is explicit.`,
  }
}

function homeRelativePath(path: string, homeDirectory: string): string {
  const homeRelative = relative(homeDirectory, path).replaceAll("\\", "/")
  if (homeRelative.length === 0 || homeRelative.startsWith("../") || homeRelative === "..") return path
  return `~/${homeRelative}`
}

function agentReasoningSummary(discovery: ModelDiscovery): JsonObject {
  const agents = discovery.agentConfig ?? defaultLazycodexAgentConfig(discovery)
  return Object.fromEntries(Object.entries(agents).map(([name, setting]) => [name, setting.reasoningLevel]))
}

export function refreshPlan(resolved: ResolveSetupDiscoveryResult, preset: SetupPreset): JsonObject {
  const discovery = resolved.discovery
  return {
    ok: true,
    status: "planned",
    command: "setup",
    subcommand: "refresh",
    role: "omo_grok_model_refresh",
    adapterPackage: "lfg-grok-install",
    companionPackage: "lfg-grok-install",
    executed: false,
    dryRun: false,
    lfgIsPlugin: false,
    selectedPreset: preset,
    purpose: "Refresh only the model list, per-model context_window sizes, and safe model auth in ~/.grok/config.toml. Discovery uses the current base URL (proxy first, public LiteLLM catalog for context sizes as secondary source). Local/proxy-advertised values always win. Does not touch the Grok plugin tree, hooks, agents, or TOMLs.",
    modelDiscovery: discovery ?? modelDiscoveryPlan(),
    modelDiscoverySource: resolved.baseUrlSource,
    modelsBaseUrlUsed: resolved.baseUrlUsed,
    autoModelAliases: discovery !== null,
    steps: [
      { id: 1, status: discovery === null ? "pending" : "done", text: "Re-discover OpenAI-compatible models and context windows from CLI/env/config.toml/default proxy (public LiteLLM catalog enrichment attempted when proxy omits sizes)." },
      { id: 2, status: "pending", text: "Write [endpoints].models_base_url, [models].default, [model.*] (fresh context_window; per-provider api_key/env_key when declared, single global key only for single-endpoint discovery), and [omo.models] (roles + available model registry) into ~/.grok/config.toml. OpenGrok: when [omo.providers.*] is declared, each provider is discovered separately and its models injected as Grok-native [model.*] sections with that provider's own credential. Preserve prior context_window when discovery provides none for a model." },
    ],
    note: "This is a config-only maintenance operation. Use --run to execute. No Grok plugin install or hook registration occurs.",
  }
}

export function buildRefreshExecutedJson(
  refreshResult: Awaited<ReturnType<typeof refreshGrokModelConfig>>,
  discovery: ModelDiscovery | null,
  resolved: ResolveSetupDiscoveryResult,
): JsonObject {
  return {
    ok: refreshResult.ok,
    status: refreshResult.status === "refreshed" ? "refreshed" : "refresh_no_discovery",
    command: "setup",
    subcommand: "refresh",
    executed: true,
    role: "omo_grok_model_refresh",
    adapterPackage: "lfg-grok-install",
    companionPackage: "lfg-grok-install",
    lfgIsPlugin: false,
    modelDiscoverySource: resolved.baseUrlSource,
    modelsBaseUrlUsed: resolved.baseUrlUsed,
    ...(refreshResult.configUpdate
      ? {
          configUpdated: true,
          configPath: refreshResult.configUpdate.path,
          modelsBaseUrl: refreshResult.configUpdate.modelsBaseUrl,
          grokConfig: grokConfigJson(refreshResult.configUpdate),
        }
      : {}),
    ...(refreshResult.discovery
      ? { modelDiscovery: refreshResult.discovery }
      : discovery
        ? { modelDiscovery: discovery }
        : {}),
    ...(!refreshResult.ok
      ? {
          error:
            "No model discovery available; provide --base-url, set LFG_GROK_BASE_URL/LAZYCODEX_OPENAI_BASE_URL, ensure ~/.grok/config.toml has [endpoints].models_base_url, or ensure the default proxy is reachable.",
        }
      : {}),
  }
}

export async function runRefreshWizard(resolved: ResolveSetupDiscoveryResult): Promise<JsonObject> {
  const { printInstallIntro, printStep } = await import("./lfg-interactive-ui.js")
  const { createInterface } = await import("node:readline/promises")
  const { stdin: input, stdout: output } = await import("node:process")
  printInstallIntro()
  printStep(1, "Model / auth refresh")
  output.write("This will re-discover models and context windows (proxy + public LiteLLM catalog) and update ~/.grok/config.toml model sections.\n")
  output.write("It does not reinstall or modify the Grok adapter plugin tree, hooks, or agent TOMLs.\n\n")
  const reader = createInterface({ input, output })
  try {
    output.write("Proceed with refresh? [y/N] ")
    const answer = await reader.question("")
    const yes = answer.trim().toLowerCase().startsWith("y")
    if (!yes) {
      output.write("Cancelled.\n")
      return { ok: true, status: "skipped", executed: false, command: "setup", subcommand: "refresh" }
    }
    const apiKey = await resolveGrokApiKey(process.env)
    const home = resolveGrokSetupHome(process.env)
    const discovery = resolved.discovery
    const refreshResult = await refreshGrokModelConfig(discovery, { home, apiKey })
    if (refreshResult.configUpdate) {
      output.write(`Updated ~/.grok/config.toml at ${refreshResult.configUpdate.path}\n`)
    }
    output.write(refreshResult.ok ? "Model config refreshed.\n" : "No discovery available; nothing written.\n")
    return buildRefreshExecutedJson(refreshResult, discovery, resolved)
  } finally {
    reader.close()
  }
}
