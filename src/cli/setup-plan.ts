import { grokConfigJson, refreshGrokModelConfig } from "./lfg-grok-config"
import { modelDiscoveryPlan, type ModelDiscovery, type SetupPreset } from "./lfg-models"
import { type JsonObject } from "./lfg-json"
import { resolveGrokApiKey } from "../grok-adapter/grok-api-key"
import { resolveGrokSetupHome } from "../grok-adapter/grok-home"
import { INTERNAL_GROK_INSTALL_COMMAND } from "../grok-adapter/run-grok-install"
import type { ResolveSetupDiscoveryResult } from "../grok-adapter/resolve-setup-discovery"

export function setupPlan(resolved: ResolveSetupDiscoveryResult, preset: SetupPreset): JsonObject {
  const discovery = resolved.discovery
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
      { id: "grok", label: "Grok-centered hybrid", text: "Prefer Grok for default agents, with GPT help for critical review when available." },
      { id: "gpt", label: "GPT-centered", text: "Prefer GPT/Codex model ids for default, reasoning, and coding aliases." },
    ],
    executed: false,
    dryRun: false,
    lfgIsPlugin: false,
    installPath: "grok",
    purpose: "Grok-first direct install of the OMO adapter into Grok Build. `setup --run` preserves a healthy stamped ~/.grok/plugins/lfg tree and syncs model config from discovered CLI proxy models. `setup --run --force` replaces the adapter tree as a real directory (including symlink/legacy cleanup). Supported hooks, Sisyphus, ultrawork context, ulw skills, agents, and manifest-only MCP entries are materialized under ~/.grok/plugins/lfg; deferred OMO components stay documented as deferred or unsupported.",
    modelDiscovery: discovery ?? modelDiscoveryPlan(),
    modelDiscoverySource: resolved.baseUrlSource,
    modelsBaseUrlUsed: resolved.baseUrlUsed,
    autoModelAliases: discovery !== null,
    steps: [
      { id: 1, status: discovery === null ? "pending" : "done", text: "Discover OpenAI-compatible models (CLI/env/config.toml/default proxy) that will be used for Grok [model.*] aliases and the explorer/reasoning/coding agents." },
      { id: 2, status: discovery === null ? "pending" : "done", text: "Build the Grok agent role configs and LFP-style per-agent overrides from the discovered models + bundled omo defaults." },
      { id: 3, status: "pending", text: `Preserve or materialize via ${INTERNAL_GROK_INSTALL_COMMAND}: preserve healthy stamped ~/.grok/plugins/lfg unless --force is explicit; otherwise replace symlink/dirty/legacy entries with a real lfg directory from LFG_OMO_PLUGIN_SOURCE, the built-in native payload, or legacy fallback.` },
      { id: 4, status: "pending", text: "Post-install on Grok surfaces: sync model config from discovered CLI proxy models; for new/forced installs also register Grok-compatible hooks, install plugin-owned LFG agents, sync roles/personas/prompts, write omo-agent-overrides.json, and ensure the adapter is enabled for Grok Build." },
    ],
    note: "Grok-first. Default `lfg setup` (and --json setup) plans the supported lfg-owned OMO port under ~/.grok/plugins/lfg, including manifest-only MCP entries rather than behavior-adapted local MCP tools. Everything lives under ~/.grok as a real directory. Existing stamped lfg setups are preserved by setup --run unless --force is explicit.",
  }
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
    purpose: "Refresh only the model list, per-model context_window sizes, and auth (api_key) in ~/.grok/config.toml. Discovery uses the current base URL (proxy first, public LiteLLM catalog for context sizes as secondary source). Local/proxy-advertised values always win. Does not touch the Grok plugin tree, hooks, agents, or TOMLs.",
    modelDiscovery: discovery ?? modelDiscoveryPlan(),
    modelDiscoverySource: resolved.baseUrlSource,
    modelsBaseUrlUsed: resolved.baseUrlUsed,
    autoModelAliases: discovery !== null,
    steps: [
      { id: 1, status: discovery === null ? "pending" : "done", text: "Re-discover OpenAI-compatible models and context windows from CLI/env/config.toml/default proxy (public LiteLLM catalog enrichment attempted when proxy omits sizes)." },
      { id: 2, status: "pending", text: "Write [endpoints].models_base_url, [models].default, [model.*] (with fresh context_window + api_key from OPENAI_API_KEY/XAI_API_KEY or the active Codex provider), and [omo.models] into ~/.grok/config.toml. Preserve prior context_window when discovery provides none for a model." },
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
