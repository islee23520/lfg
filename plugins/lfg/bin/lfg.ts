#!/usr/bin/env node
import { unsupportedCommand } from "./lfg-command"
import { runInstallWizard } from "./lfg-interactive"
import { LAZYCODEX_INSTALLER_COMMAND, runLazycodexInstaller } from "./lfg-installer"
import { INTERNAL_GROK_INSTALL_COMMAND } from "../grok-install/run-grok-install"
import { homedir } from "node:os"
import { applyModelPreset, modelDiscoveryPlan, type ModelDiscovery, type SetupPreset } from "./lfg-models"
import { resolveSetupDiscovery } from "../grok-install/resolve-setup-discovery"
import { isRecord, type JsonObject } from "./lfg-json"
import { grokConfigJson, refreshGrokModelConfig } from "./lfg-grok-config"
import { resolveGrokApiKey } from "../grok-install/grok-api-key"

type ParsedArgs = {
  readonly json: boolean
  readonly run: boolean
  readonly force: boolean
  readonly refresh: boolean
  readonly noTui: boolean
  readonly preset: SetupPreset
  readonly presetError: string | null
  readonly baseUrl: string | null
  readonly positional: readonly string[]
}

const DEFAULT_SETUP_PRESET: SetupPreset = "grok"

async function main(argv: readonly string[]): Promise<number> {
  const parsed = parseArgs(argv)
  try {
    const result = await dispatch(parsed)

    // Bare `lfg setup` (the human guided command, no --json no --run) must never dump a raw
    // plan object or full status JSON as primary output. The wizard owns the entire conversation:
    // header, auto-discovered models, short questions (role customize? + final confirm), the
    // "Direct Grok install..." notice, and human success/failure lines.
    // --refresh (model/auth re-sync) is a fast maintenance op and bypasses the full wizard.
    const isBareInteractiveSetup =
      !parsed.json && !parsed.run &&
      parsed.positional[0] === "setup" && parsed.positional.length === 1 &&
      !parsed.refresh

    if (parsed.json) {
      // --json is the machine/automation surface. Always emit the structured value.
      emit(result, true)
    } else if (parsed.run || isSetupForceShortcut(parsed)) {
      // setup --run is the "just do the direct Grok materialization" command (for scripts).
      // Only surface the human-readable stdout/stderr that the internal steps produced.
      // The full object is available via --json setup --run if someone needs the structure.
      if (isRecord(result)) {
        const r = result as Record<string, unknown>
        const out = typeof r.stdout === "string" ? (r.stdout as string) : ""
        const err = typeof r.stderr === "string" ? (r.stderr as string) : ""
        if (out) process.stdout.write(out.endsWith("\n") ? out : `${out}\n`)
        if (err) process.stderr.write(err.endsWith("\n") ? err : `${err}\n`)
      } else {
        process.stdout.write(String(result) + "\n")
      }
    } else if (!isBareInteractiveSetup) {
      // Other non-json commands (help text etc.) can emit normally.
      emit(result, false)
    }
    // For bare `lfg setup` we intentionally do not emit `result` here.
    // runInstallWizard already wrote only the text a human should see.

    return isFailure(result) ? 1 : 0
  } catch (error) {
    emit({ ok: false, status: "error", error: error instanceof Error ? error.message : String(error) }, true)
    return 1
  }
}

async function dispatch(args: ParsedArgs): Promise<JsonObject | string> {
  if (args.presetError !== null) {
    return { ok: false, status: "invalid_preset", error: args.presetError, supportedPresets: ["grok", "gpt"] }
  }
  // Tolerate TUI flags (and --force) that may appear as extra positionals from shell invocation
  // (e.g. `lfg setup --no-tui`, `lfg --no-tui setup`). We already parse them into args.noTui etc.,
  // but we keep the positional list stable for error messages and JSON contracts.
  const effectivePos = (args.positional || []).filter((p) => !["--no-tui", "no-tui", "--force", "force"].includes(p as string))
  const [command, subcommand] = effectivePos
  if (!command || command === "help" || command === "--help" || command === "-h") {
    return help()
  }
  const isForceOnly = (subcommand === "--force" || subcommand === "force")
  if (command !== "setup" || (subcommand && !isForceOnly)) {
    return unsupportedCommand(args.positional)
  }
  const home = process.env.HOME ?? homedir()
  const resolved = await resolveSetupDiscovery({ home, cliBaseUrl: args.baseUrl })
  const discovery = resolved.discovery === null ? null : applyModelPreset(resolved.discovery, args.preset)
  const presetResolved = { ...resolved, discovery }

  // --refresh path: lightweight re-sync of model list + per-model context_window + auth into ~/.grok/config.toml.
  // Does not mutate the Grok plugin tree, hooks, or agent TOMLs. Always attempts public LiteLLM catalog enrichment
  // for context windows when the proxy does not advertise them (local/proxy values still win).
  if (args.refresh) {
    if (args.run) {
      // Execute the refresh (discovery + write only).
      const apiKey = await resolveGrokApiKey(process.env)
      const refreshResult = await refreshGrokModelConfig(discovery, { home, apiKey })
      return buildRefreshExecutedJson(refreshResult, discovery, resolved)
    }
    // Plan / describe only (non-mutating).
    const plan = refreshPlan(presetResolved, args.preset)
    return args.json ? plan : runRefreshWizard(plan, presetResolved)
  }

  if (args.run || isForceOnly) {
    return runLazycodexInstaller(discovery, { force: args.force || isForceOnly })
  }
  const plan = setupPlan(presetResolved, args.preset)
  if (args.json) {
    return plan
  }

  // TTY-aware setup routing for bare `lfg setup` (parity with LFP `lfp setup`).
  // When stdin/stdout are TTYs and --no-tui is not given, use the Clack TUI wrapper.
  // The TUI shows LFP-style framing (intro/note/confirm/select/outro), captures the
  // classic line wizard output into a "Setup results" note, then returns control.
  // Non-TTY, --no-tui, or automation paths fall through to the existing readline wizard.
  const isInteractiveBare = isInteractiveInstall(args)
  if (isInteractiveBare) {
    // Explicit --no-tui (or non-TTY) must bypass the TUI entirely and use the pure
    // legacy readline wizard so that stdout contains only the classic oMo... steps
    // with no Clack framing or @clack/prompts calls. This is required for C002 parity.
    if (args.noTui) {
      return runInstallWizard(plan, presetResolved)
    }
    const { shouldUseSetupTui, runSetupTui } = await import("./lfg-setup-tui.js")
    if (shouldUseSetupTui(args, { check: false, input: process.stdin as any, output: process.stdout as any })) {
      // TUI path (bare `lfg setup` on real TTY): use the self-contained Clack runner.
      // It performs the three role agent selects itself (Model / Service tier / Reasoning effort),
      // prints ONLY the three clean summary lines (e.g. "  explorer: grok-3-mini-fast / low (tier: default)"),
      // shows its own Install Summary + final Clack "Install now?" confirm, then directly runs the
      // Grok installer. This path must never delegate to the classic readline wizard, because that
      // wizard emits "Current:", "Default: keep...", "Recommended:", "Alternatives:", the "Configure
      // other LazyCodex agents...?" question, the plan review, magic word, "Install now? [y/N]",
      // "Installation cancelled...", and "oMoMoMoMo... Bye!".
      // We deliberately pass no runLineSetup (or a no-op) so the self-contained TUI flow is used.
      const tuiResult = await runSetupTui(args, { plan, resolved: presetResolved }, {
        // No runLineSetup delegation for the main TUI experience. The runner is self-contained.
        runLineSetup: undefined as any,
      })
      return tuiResult ?? { ok: true, status: "tui_completed", executed: true }
    }
  }

  return runInstallWizard(plan, presetResolved)
}

function isInteractiveInstall(args: ParsedArgs): boolean {
  // Treat explicit --no-tui (and stray --force tokens) as non-disqualifying for the "bare interactive" shape.
  const cleaned = (args.positional || []).filter((p) => !["--no-tui", "no-tui", "--force", "force"].includes(String(p)))
  return !args.json && !args.run && cleaned[0] === "setup" && cleaned.length === 1 && !args.refresh
}

function isInteractiveRefresh(args: ParsedArgs): boolean {
  return !args.json && !args.run && args.positional[0] === "setup" && args.positional.length === 1 && args.refresh === true
}

function isSetupForceShortcut(args: ParsedArgs): boolean {
  return !args.json && !args.run && args.positional[0] === "setup" && (args.positional[1] === "--force" || args.positional[1] === "force")
}

function setupPlan(resolved: Awaited<ReturnType<typeof resolveSetupDiscovery>>, preset: SetupPreset): JsonObject {
  const discovery = resolved.discovery
  return {
    ok: true,
    status: "planned",
    command: "setup",
    role: "lazycodex_adapter_installer",
    adapterPackage: "lfg-grok-install",
    companionPackage: "lfg-grok-install",
    installerCommand: INTERNAL_GROK_INSTALL_COMMAND,
    grokInstallerCommand: INTERNAL_GROK_INSTALL_COMMAND,
    lfpInstallerCommand: INTERNAL_GROK_INSTALL_COMMAND,
    legacyCodexInstallerCommand: LAZYCODEX_INSTALLER_COMMAND,
    packageExecutors: ["npx @islee23520/lfg"],
    selectedPreset: preset,
    presets: [
      { id: "grok", label: "Grok-centered hybrid", text: "Prefer Grok for default agents, with GPT help for critical review when available." },
      { id: "gpt", label: "GPT-centered", text: "Prefer GPT/Codex model ids for default, reasoning, and coding aliases." },
    ],
    executed: false,
    dryRun: false,
    lfgIsPlugin: false,
    skippedCodexInstaller: true,
    installPath: "grok",
    purpose: "Grok-first direct install of the omo/lazycodex adapter into Grok Build. `setup --run` preserves a healthy stamped ~/.grok/plugins/lfg tree and syncs model config from discovered CLI proxy models. `setup --run --force` replaces the adapter tree as a real directory (including symlink/legacy cleanup). `npx lazycodex-ai install` (Codex path) is NOT executed on the default path.",
    modelDiscovery: discovery ?? modelDiscoveryPlan(),
    modelDiscoverySource: resolved.baseUrlSource,
    modelsBaseUrlUsed: resolved.baseUrlUsed,
    autoModelAliases: discovery !== null,
    steps: [
      { id: 1, status: discovery === null ? "pending" : "done", text: "Discover OpenAI-compatible models (CLI/env/config.toml/default proxy) that will be used for Grok [model.*] aliases and the explorer/reasoning/coding agents." },
      { id: 2, status: discovery === null ? "pending" : "done", text: "Build the Grok agent role configs and LFP-style per-agent overrides from the discovered models + bundled omo defaults." },
      { id: 3, status: "pending", text: `Preserve or materialize via ${INTERNAL_GROK_INSTALL_COMMAND}: preserve healthy stamped ~/.grok/plugins/lfg unless --force is explicit; otherwise replace symlink/dirty/legacy entries with a real lfg directory from LFG_LAZYCODEX_PLUGIN_SOURCE, npm _npx cache of lazycodex-ai, or the built-in fixture.` },
      { id: 4, status: "pending", text: `Post-install on Grok surfaces: sync model config from discovered CLI proxy models; for new/forced installs also register Grok-compatible hooks, install plugin-owned LFG agents, sync roles/personas/prompts, write lazycodex-agent-overrides.json, and ensure the adapter is enabled for Grok Build.` },
    ],
    note: "Grok-first. Default `lfg setup` (and --json setup) does not execute `npx lazycodex-ai install`. The legacyCodexInstallerCommand is kept only for reference (optional separate Codex bootstrap). Everything lives under ~/.grok as a real directory. Existing stamped lfg setups are preserved by setup --run unless --force is explicit.",
  }
}

/** Non-mutating plan for `lfg --json setup --refresh` (and bare `lfg setup --refresh`). */
function refreshPlan(resolved: Awaited<ReturnType<typeof resolveSetupDiscovery>>, preset: SetupPreset): JsonObject {
  const discovery = resolved.discovery
  return {
    ok: true,
    status: "planned",
    command: "setup",
    subcommand: "refresh",
    role: "lazycodex_adapter_model_refresh",
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
      { id: 2, status: "pending", text: "Write [endpoints].models_base_url, [models].default, [model.*] (with fresh context_window + api_key from OPENAI_API_KEY/XAI_API_KEY or the active Codex provider), and [lazycodex.models] into ~/.grok/config.toml. Preserve prior context_window when discovery provides none for a model." },
    ],
    note: "This is a config-only maintenance operation. Use --run to execute. No Grok plugin install or hook registration occurs.",
  }
}

/** Build the JSON result for an executed --refresh --run. */
function buildRefreshExecutedJson(
  refreshResult: Awaited<ReturnType<typeof refreshGrokModelConfig>>,
  discovery: ModelDiscovery | null,
  resolved: Awaited<ReturnType<typeof resolveSetupDiscovery>>,
): JsonObject {
  const base: JsonObject = {
    ok: refreshResult.ok,
    status: refreshResult.status === "refreshed" ? "refreshed" : "refresh_no_discovery",
    command: "setup",
    subcommand: "refresh",
    executed: true,
    role: "lazycodex_adapter_model_refresh",
    adapterPackage: "lfg-grok-install",
    companionPackage: "lfg-grok-install",
    lfgIsPlugin: false,
    modelDiscoverySource: resolved.baseUrlSource,
    modelsBaseUrlUsed: resolved.baseUrlUsed,
  }
  if (refreshResult.configUpdate) {
    ;(base as Record<string, unknown>).configUpdated = true
    ;(base as Record<string, unknown>).configPath = refreshResult.configUpdate.path
    ;(base as Record<string, unknown>).modelsBaseUrl = refreshResult.configUpdate.modelsBaseUrl
    ;(base as Record<string, unknown>).grokConfig = grokConfigJson(refreshResult.configUpdate)
  }
  if (refreshResult.discovery) {
    ;(base as Record<string, unknown>).modelDiscovery = refreshResult.discovery
  } else if (discovery) {
    ;(base as Record<string, unknown>).modelDiscovery = discovery
  }
  if (!refreshResult.ok) {
    ;(base as Record<string, unknown>).error = "No model discovery available; provide --base-url, set LFG_GROK_BASE_URL/LAZYCODEX_OPENAI_BASE_URL, ensure ~/.grok/config.toml has [endpoints].models_base_url, or ensure the default proxy is reachable."
  }
  return base
}

/** For bare interactive `lfg setup --refresh` we keep it minimal: show plan info and execute if confirmed. */
async function runRefreshWizard(plan: JsonObject, resolved: Awaited<ReturnType<typeof resolveSetupDiscovery>>): Promise<JsonObject> {
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
    const home = process.env.HOME ?? homedir()
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

function parseArgs(argv: readonly string[]): ParsedArgs {
  const positional: string[] = []
  let baseUrl: string | null = null
  let preset: SetupPreset = DEFAULT_SETUP_PRESET
  let presetError: string | null = null
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--json" || arg === "--run" || arg === "--force" || arg === "--refresh" || arg === "--no-tui") {
      continue
    }
    if (arg === "--preset") {
      const value = argv[index + 1]
      if (isSetupPreset(value)) {
        preset = value
        index += 1
        continue
      }
      presetError = `Unsupported setup preset: ${typeof value === "string" ? value : ""}`
      if (typeof value === "string") {
        index += 1
      }
      continue
    }
    if (arg === "--base-url" || arg === "--openai-base-url") {
      const value = argv[index + 1]
      if (typeof value === "string") {
        baseUrl = value
        index += 1
        continue
      }
    }
    if (typeof arg === "string") {
      positional.push(arg)
    }
  }
  return {
    json: argv.includes("--json"),
    run: argv.includes("--run"),
    force: argv.includes("--force"),
    refresh: argv.includes("--refresh"),
    noTui: argv.includes("--no-tui"),
    preset,
    presetError,
    baseUrl,
    positional,
  }
}

function isSetupPreset(value: unknown): value is SetupPreset {
  return value === "grok" || value === "gpt"
}

function emit(value: JsonObject | string, json: boolean): void {
  if (json || typeof value !== "string") {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
    return
  }
  process.stdout.write(`${value}\n`)
}

function isFailure(value: JsonObject | string): boolean {
  return isRecord(value) && value.ok === false
}

function help(): string {
  return [
    "lfg - setup lazycodex-ai and Grok adapter extensions for Grok Build",
    "",
    "Commands:",
    "  lfg setup",
    "",
    "Package execution:",
    "  npx @islee23520/lfg setup",
    "",
    "Automation:",
    "  lfg --json setup",
    "  lfg --json setup --run",
    "  lfg setup --run",
    "  lfg --json setup --preset grok",
    "  lfg --json setup --preset gpt",
    "  lfg --json setup --run --force",
    "  lfg --json setup --refresh",
    "  lfg --json setup --refresh --run",
    "  lfg setup --refresh --run",
    "  lfg setup --no-tui",
    "  (models auto: ~/.grok [endpoints].models_base_url or http://127.0.0.1:8317/v1)",
    "  TTY bare setup uses a Clack-based TUI (LFP-style framing) with line fallback; --no-tui forces classic readline.",
    "",
    "Refresh (model list + context windows + per-model auth):",
    "  Re-discovers models from the current base URL (proxy + public LiteLLM catalog for context sizes),",
    "  then writes fresh [model.*] sections (including grok-build alias) and lazycodex.models into ~/.grok/config.toml.",
    "  Does not touch the Grok plugin tree, hooks, or agent TOMLs. Existing prior context_window values are preserved",
    "  when the current discovery does not advertise a size for a model. OPENAI_API_KEY/XAI_API_KEY, or the active",
    "  Codex provider token when env is unset, is written per model.",
    "",
    "Setup runs:",
    `  ${LAZYCODEX_INSTALLER_COMMAND}`,
    `  ${INTERNAL_GROK_INSTALL_COMMAND}`,
  ].join("\n")
}

process.exit(await main(process.argv.slice(2)))
