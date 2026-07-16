#!/usr/bin/env node
import { unsupportedCommand } from "./lfg-command"
import { runInstallWizard } from "../setup/lfg-interactive"
import { runLazycodexInstaller } from "../setup/lfg-installer"
import { INTERNAL_GROK_INSTALL_COMMAND } from "../../grok/install/run-grok-install"
import { runGrokDoctor } from "../../grok/doctor/doctor"
import { applyAgentServiceTier } from "../models/set-agent-service-tier"
import type { ServiceTier } from "../../grok/agents/lazycodex-agent-overrides"
import { applyModelPreset, withReasoningEffort, type ReasoningEffortChoice, type SetupPreset } from "../models/lfg-models"
import { resolveSetupDiscovery } from "../../grok/install/resolve-setup-discovery"
import { isRecord, type JsonObject } from "../../shared/json"
import { refreshGrokModelConfig } from "../config/lfg-grok-config"
import { resolveGrokApiKey } from "../../grok/install/grok-api-key"
import { resolveGrokSetupHome } from "../../grok/install/grok-home"

import { buildRefreshExecutedJson, refreshPlan, runRefreshWizard, setupPlan } from "../setup/setup-plan"
import { dispatchXaiAuthCommand } from "../xai/xai-auth-command"
import { dispatchMcpCompanionCommand } from "../mcp/companion-command"
import { dispatchClaudeCommand } from "../claude/claude-command"
import { codingToolLaunchPlan, formatLaunchError, launchCodingToolAdapter } from "./coding-tool-launcher"
import { loadBundledDefaultOmoOverrides } from "../../grok/agents/lazycodex-agent-overrides"
import { buildVanillaGrokDiscovery } from "../setup/lfg-setup-tui-data"
import { dispatchUlwLoopArgv } from "../ulw-loop/lfg-ulw-loop.js"
import { dispatchHandoffCommand } from "./handoff-command"
import { dispatchStartWorkCommand } from "./start-work-command"
import { dispatchUlwPlanCommand } from "./ulw-plan-command"
import { dispatchGoalCommand } from "./goal-command"
import { dispatchOrchestratorCommand } from "./orchestrator-command"
import { dispatchUninstallCommand } from "./uninstall-command"
import { dispatchAccountsCommand } from "./accounts-command"
import {
  CODING_TOOL_ADAPTER_IDS,
  DEFAULT_CODING_TOOL_ADAPTER,
  isCodingToolAdapterId,
  type CodingToolAdapterId,
} from "../setup/coding-tool-adapter"
import { CLI_BACKENDS, DEFAULT_CLI_BACKEND, normalizeCliBackend, type CliBackend } from "../../core/lfg/backend-routing"

type ParsedArgs = {
  readonly json: boolean
  readonly run: boolean
  readonly force: boolean
  readonly refresh: boolean
  readonly installOnly: boolean
  readonly noTui: boolean
  readonly noProbe: boolean
  readonly preset: SetupPreset
  readonly presetError: string | null
  readonly codingToolAdapter: CodingToolAdapterId
  readonly codingToolAdapterExplicit: boolean
  readonly codingToolAdapterError: string | null
  readonly backendEngine: CliBackend
  readonly backendEngineExplicit: boolean
  readonly backendEngineError: string | null
  readonly reasoningEffort: ReasoningEffortChoice
  readonly reasoningEffortError: string | null
  readonly baseUrl: string | null
  readonly xaiApiKey: string | null
  readonly xaiOauthAccessToken: string | null
  readonly xaiOauthRefreshToken: string | null
  readonly xaiOauthExpiresAt: string | null
  readonly xaiOauthExpiresIn: string | null
  readonly xaiOauthTokenEndpoint: string | null
  readonly xaiOauthTokenType: string | null
  readonly agent: string | null
  readonly tier: ServiceTier | null
  readonly positional: readonly string[]
}

const DEFAULT_SETUP_PRESET: SetupPreset = "auto"
const DEFAULT_REASONING_EFFORT: ReasoningEffortChoice = "auto"

async function main(argv: readonly string[]): Promise<number> {
  const parsed = parseArgs(argv)
  try {
    if (isBareLaunch(parsed)) {
      if (parsed.codingToolAdapterError !== null) {
        const errorResult = invalidCodingToolAdapterJson(parsed.codingToolAdapterError)
        emit(errorResult, true)
        return 1
      }
      const cliAdapter = parsed.codingToolAdapterExplicit ? parsed.codingToolAdapter : null
      if (parsed.json) {
        emit(await codingToolLaunchPlan(cliAdapter), true)
        return 0
      }
      const launchResult = await launchCodingToolAdapter(cliAdapter)
      if (!launchResult.ok) {
        process.stderr.write(`${formatLaunchError(launchResult)}\n`)
      }
      return launchResult.exitCode
    }

    // Durable ulw-loop CLI owns its own stdout/stderr and exit codes (not setup JSON contract).
    // parseArgs strips global flags like --json; re-attach them so ulw-loop subcommands still see them.
    if ((parsed.positional || [])[0] === "ulw" || (parsed.positional || [])[0] === "ulw-loop") {
      const ulwArgv = [...parsed.positional]
      if (parsed.json && !ulwArgv.includes("--json")) ulwArgv.push("--json")
      return dispatchUlwLoopArgv(ulwArgv)
    }

    const handoffArgv = handoffCommandArgv(argv)
    const startWorkArgv = startWorkCommandArgv(argv)
    const ulwPlanArgv = ulwPlanCommandArgv(argv)
    const goalArgv = goalCommandArgv(argv)
    const result = handoffArgv !== null
      ? await dispatchHandoffCommand(handoffArgv, {
          json: parsed.json,
          noProbe: parsed.noProbe,
          env: process.env,
        })
      : startWorkArgv !== null
        ? await dispatchStartWorkCommand(startWorkArgv, {
            json: parsed.json,
            noProbe: parsed.noProbe,
            env: process.env,
          })
        : goalArgv !== null
          ? await dispatchGoalCommand(goalArgv, { json: parsed.json })
        : ulwPlanArgv !== null
          ? await dispatchUlwPlanCommand(ulwPlanArgv, {
              json: parsed.json,
              noProbe: parsed.noProbe,
              env: process.env,
            })
        : await dispatch(parsed)

    // Bare `lfg setup` (the human guided command, no --json no --run) must never dump a raw
    // plan object or full status JSON as primary output. The wizard owns the entire conversation:
    // header, auto-discovered models, short questions (role customize? + final confirm), the
    // "Direct Grok install..." notice, and human success/failure lines.
    // --refresh (model/auth re-sync) is a fast maintenance op and bypasses the full wizard.
    const isBareInteractiveSetup =
      !parsed.json && !parsed.run &&
      parsed.positional[0] === "setup" && parsed.positional.length === 1 &&
      !parsed.refresh

    if (parsed.json || handoffArgv !== null || startWorkArgv !== null || ulwPlanArgv !== null || goalArgv !== null) {
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
    return { ok: false, status: "invalid_preset", error: args.presetError, supportedPresets: ["auto", "grok"] }
  }
  if (args.codingToolAdapterError !== null) {
    return invalidCodingToolAdapterJson(args.codingToolAdapterError)
  }
  if (args.backendEngineError !== null) {
    return { ok: false, status: "invalid_backend_engine", error: args.backendEngineError, supportedBackendEngines: [...CLI_BACKENDS] }
  }
  if (args.reasoningEffortError !== null) {
    return { ok: false, status: "invalid_reasoning_effort", error: args.reasoningEffortError, supportedReasoningEffort: ["auto", "low", "medium", "high", "xhigh"] }
  }
  // Tolerate TUI flags (and --force) that may appear as extra positionals from shell invocation
  // (e.g. `lfg setup --no-tui`, `lfg --no-tui setup`). We already parse them into args.noTui etc.,
  // but we keep the positional list stable for error messages and JSON contracts.
  const effectivePos = (args.positional || []).filter((p) =>
    !["--no-tui", "no-tui", "--force", "force", "--install-only", "install-only", "--update-only", "update-only"].includes(p as string),
  )
  const [command, subcommand, third] = effectivePos
  if (!command || command === "help" || command === "--help" || command === "-h") {
    return help()
  }
  if (command === "xai" && subcommand === "auth") {
    return dispatchXaiAuthCommand(third, {
      json: args.json,
      apiKeyFlag: args.xaiApiKey,
      baseUrlFlag: args.baseUrl,
      noProbe: args.noProbe,
      oauthAccessToken: args.xaiOauthAccessToken,
      oauthRefreshToken: args.xaiOauthRefreshToken,
      oauthExpiresAt: args.xaiOauthExpiresAt,
      oauthExpiresIn: args.xaiOauthExpiresIn,
      oauthTokenEndpoint: args.xaiOauthTokenEndpoint,
      oauthTokenType: args.xaiOauthTokenType,
    })
  }
  if (command === "mcp" && subcommand === "companion") {
    return dispatchMcpCompanionCommand(third, {
      json: args.json,
      rest: effectivePos.slice(3),
    })
  }
  if (command === "claude") {
    return dispatchClaudeCommand(subcommand, third, {
      json: args.json,
      rest: effectivePos.slice(3),
    })
  }
  if (command === "ulw" || command === "ulw-loop") {
    // Should have been handled in main(); keep as safety net for programmatic dispatch.
    const code = await dispatchUlwLoopArgv(effectivePos)
    return { ok: code === 0, status: code === 0 ? "ulw_loop_ok" : "ulw_loop_error", exitCode: code, lfgIsPlugin: false }
  }
  if (command === "doctor") {
    const home = resolveGrokSetupHome(process.env)
    const registryVersion = process.env.LFG_DOCTOR_REGISTRY_VERSION ?? null
    const doctor = await runGrokDoctor({
      home,
      moduleUrl: import.meta.url,
      ...(registryVersion === null ? {} : { registryVersion }),
    })
    return { ...doctor, lfgIsPlugin: false }
  }
  if (command === "orchestrator") {
    return dispatchOrchestratorCommand(effectivePos.slice(1), {
      json: args.json,
      env: process.env,
    })
  }
  if (command === "uninstall") {
    return dispatchUninstallCommand({ home: resolveGrokSetupHome(process.env), argv: effectivePos.slice(1) })
  }
  if (command === "accounts") {
    if (subcommand === undefined && !args.json) {
      const { runAccountsTui, shouldUseAccountsTui } = await import("./accounts-tui.js")
      if (shouldUseAccountsTui({ input: process.stdin, output: process.stdout })) {
        return runAccountsTui({ home: resolveGrokSetupHome(process.env) })
      }
    }
    return dispatchAccountsCommand(effectivePos.slice(1), { home: resolveGrokSetupHome(process.env) })
  }
  if (command === "set-tier") {
    const home = resolveGrokSetupHome(process.env)
    const agent = args.agent ?? (typeof subcommand === "string" && !subcommand.startsWith("-") ? subcommand : null)
    const tier = args.tier
    if (agent === null || agent.length === 0) {
      return {
        ok: false,
        status: "invalid_set_tier",
        error: "set-tier requires --agent <name>",
        usage: "lfg --json set-tier --agent <name> --tier default|fast",
        lfgIsPlugin: false,
      }
    }
    if (tier === null) {
      return {
        ok: false,
        status: "invalid_set_tier",
        error: "set-tier requires --tier default|fast",
        usage: "lfg --json set-tier --agent <name> --tier default|fast",
        lfgIsPlugin: false,
      }
    }
    try {
      const result = await applyAgentServiceTier({ home, agent, tier })
      return {
        ok: true,
        status: "set_tier_ok",
        ...result,
        lfgIsPlugin: false,
      }
    } catch (error) {
      return {
        ok: false,
        status: "set_tier_error",
        error: error instanceof Error ? error.message : String(error),
        agent,
        tier,
        lfgIsPlugin: false,
      }
    }
  }
  const isForceOnly = (subcommand === "--force" || subcommand === "force")
  const isConfigTui = subcommand === "config" || subcommand === "tui"
  if (command !== "setup" || (subcommand && !isForceOnly && !isConfigTui)) {
    return unsupportedCommand(args.positional)
  }
  const home = resolveGrokSetupHome(process.env)
  const setupCodingToolAdapter = await resolveSetupCodingToolAdapter(args, home)
  const hostAuthOnly = setupCodingToolAdapter === "grok" && args.baseUrl === null && !args.refresh && !args.installOnly && !isConfigTui
  const resolved = args.installOnly
    ? { discovery: null, baseUrlUsed: null, baseUrlSource: "none" as const, autoDiscovered: false }
    : await resolveSetupDiscovery({ home, cliBaseUrl: args.baseUrl, hostAuthOnly })
  const resolvedDiscovery =
    hostAuthOnly && resolved.discovery === null
      ? buildVanillaGrokDiscovery(await loadBundledDefaultOmoOverrides(), undefined, args.reasoningEffort)
      : resolved.discovery
  const resolvedForSetup = { ...resolved, discovery: resolvedDiscovery }
  if (isConfigTui) {
    if (args.json) {
      return { ok: false, status: "tui_requires_terminal", command: "setup config", error: "Use bare `lfg setup config` to edit model routing in the TUI." }
    }
    const { runSetupTui } = await import("../setup/lfg-setup-tui.js")
    const discoveryForConfig = resolvedForSetup.discovery === null ? null : withReasoningEffort(applyModelPreset(resolvedForSetup.discovery, args.preset), args.reasoningEffort)
    const configResult = await runSetupTui(args, { plan: {}, resolved: { ...resolvedForSetup, discovery: discoveryForConfig }, configOnly: true })
    return configResult ?? { ok: true, status: "tui_config_completed", executed: true }
  }
  const discovery = resolvedForSetup.discovery === null
    ? null
    : hostAuthOnly
      ? resolvedForSetup.discovery
      : withReasoningEffort(applyModelPreset(resolvedForSetup.discovery, args.preset), args.reasoningEffort)
  const presetResolved = { ...resolvedForSetup, discovery }

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
    return args.json ? plan : runRefreshWizard(presetResolved)
  }

  if (args.run || isForceOnly) {
    return runLazycodexInstaller(discovery, {
      force: args.force || isForceOnly,
      installOnly: args.installOnly,
      codingToolAdapter: setupCodingToolAdapter,
      ...(args.backendEngineExplicit ? { backendEngine: args.backendEngine } : {}),
    })
  }
  const plan = setupPlan(presetResolved, args.preset, setupCodingToolAdapter, args.backendEngine)
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
      return runInstallWizard(plan, presetResolved, {
        codingToolAdapter: setupCodingToolAdapter,
        ...(args.backendEngineExplicit ? { backendEngine: args.backendEngine } : {}),
      })
    }
    const { shouldUseSetupTui, runSetupTui } = await import("../setup/lfg-setup-tui.js")
    if (shouldUseSetupTui(args, { check: false, input: process.stdin, output: process.stdout })) {
      // TUI path (bare `lfg setup` on real TTY): use the self-contained Clack runner.
      // It performs the three role agent selects itself (Model / Service tier / Reasoning effort),
      // prints ONLY the three clean summary lines (e.g. "  explorer: grok-3-mini-fast / low (tier: default)"),
      // shows its own Install Summary + final Clack "Install now?" confirm, then directly runs the
      // Grok installer. This path must never delegate to the classic readline wizard, because that
      // wizard emits "Current:", "Default: keep...", "Recommended:", "Alternatives:", the "Configure
      // other LazyCodex agents...?" question, the plan review, magic word, "Install now? [y/N]",
      // "Installation cancelled...", and "oMoMoMoMo... Bye!".
      // We deliberately pass no runLineSetup (or a no-op) so the self-contained TUI flow is used.
      const tuiResult = await runSetupTui(args, { plan, resolved: presetResolved })
      return tuiResult ?? { ok: true, status: "tui_completed", executed: true }
    }
  }

  return runInstallWizard(plan, presetResolved, { codingToolAdapter: setupCodingToolAdapter, backendEngine: args.backendEngineExplicit ? args.backendEngine : undefined })
}

function isInteractiveInstall(args: ParsedArgs): boolean {
  // Treat explicit --no-tui (and stray --force tokens) as non-disqualifying for the "bare interactive" shape.
  const cleaned = (args.positional || []).filter((p) => !["--no-tui", "no-tui", "--force", "force", "--install-only", "install-only"].includes(String(p)))
  return !args.json && !args.run && cleaned[0] === "setup" && cleaned.length === 1 && !args.refresh
}

function isSetupForceShortcut(args: ParsedArgs): boolean {
  return !args.json && !args.run && args.positional[0] === "setup" && (args.positional[1] === "--force" || args.positional[1] === "force")
}

async function resolveSetupCodingToolAdapter(args: ParsedArgs, _home: string): Promise<CodingToolAdapterId> {
  if (args.codingToolAdapterExplicit) {
    return args.codingToolAdapter
  }
  // Grok-only; retired lfg.json is not consulted for adapter selection.
  return DEFAULT_CODING_TOOL_ADAPTER
}

function isBareLaunch(args: ParsedArgs): boolean {
  return args.positional.length === 0 && !args.run && !args.force && !args.refresh && !args.installOnly
}

function handoffCommandArgv(argv: readonly string[]): readonly string[] | null {
  const globalFlags = new Set(["--json", "--no-probe"])
  const withoutGlobals = argv.filter((arg) => !globalFlags.has(arg))
  return withoutGlobals[0] === "handoff" ? withoutGlobals.slice(1) : null
}

function startWorkCommandArgv(argv: readonly string[]): readonly string[] | null {
  const globalFlags = new Set(["--json", "--no-probe"])
  const withoutGlobals = argv.filter((arg) => !globalFlags.has(arg))
  if (withoutGlobals[0] === "plan" && withoutGlobals[1] === "start-work") return withoutGlobals.slice(1)
  if (withoutGlobals[0] === "start-work" && withoutGlobals[1] === "launch") return withoutGlobals.slice(1)
  return null
}

function ulwPlanCommandArgv(argv: readonly string[]): readonly string[] | null {
  const globalFlags = new Set(["--json", "--no-probe"])
  const withoutGlobals = argv.filter((arg) => !globalFlags.has(arg))
  if (withoutGlobals[0] === "plan" && (withoutGlobals[1] === "ulw-plan" || withoutGlobals[1] === "codex")) {
    return withoutGlobals.slice(1)
  }
  return null
}

function goalCommandArgv(argv: readonly string[]): readonly string[] | null {
  const withoutGlobals = argv.filter((arg) => arg !== "--json")
  if (withoutGlobals[0] === "goal") return withoutGlobals.slice(1)
  return withoutGlobals[0] === "plan" && withoutGlobals[1] === "goal" ? withoutGlobals.slice(1) : null
}

function invalidCodingToolAdapterJson(error: string): JsonObject {
  return {
    ok: false,
    status: "invalid_coding_tool_adapter",
    error,
    supportedCodingToolAdapters: [...CODING_TOOL_ADAPTER_IDS],
  }
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const positional: string[] = []
  let baseUrl: string | null = null
  let xaiApiKey: string | null = null
  let xaiOauthAccessToken: string | null = null
  let xaiOauthRefreshToken: string | null = null
  let xaiOauthExpiresAt: string | null = null
  let xaiOauthExpiresIn: string | null = null
  let xaiOauthTokenEndpoint: string | null = null
  let xaiOauthTokenType: string | null = null
  let agent: string | null = null
  let tier: ServiceTier | null = null
  let preset: SetupPreset = DEFAULT_SETUP_PRESET
  let presetError: string | null = null
  let codingToolAdapter: CodingToolAdapterId = DEFAULT_CODING_TOOL_ADAPTER
  let codingToolAdapterExplicit = false
  let codingToolAdapterError: string | null = null
  let backendEngine: CliBackend = DEFAULT_CLI_BACKEND
  let backendEngineExplicit = false
  let backendEngineError: string | null = null
  let reasoningEffort: ReasoningEffortChoice = DEFAULT_REASONING_EFFORT
  let reasoningEffortError: string | null = null
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (
      arg === "--json" ||
      arg === "--run" ||
      arg === "--force" ||
      arg === "--refresh" ||
      arg === "--install-only" ||
      arg === "--no-tui" ||
      arg === "--no-probe"
    ) {
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
    if (arg === "--coding-tool-adapter") {
      const value = argv[index + 1]
      if (isCodingToolAdapterId(value)) {
        codingToolAdapter = value
        codingToolAdapterExplicit = true
        index += 1
        continue
      }
      codingToolAdapterError = `Unsupported coding tool adapter: ${typeof value === "string" ? value : ""}`
      if (typeof value === "string") {
        index += 1
      }
      continue
    }
    if (arg === "--backend-engine") {
      const value = argv[index + 1]
      const engine = normalizeCliBackend(value)
      if (engine !== null) {
        backendEngine = engine
        backendEngineExplicit = true
        index += 1
        continue
      }
      backendEngineError = `Unsupported backend engine: ${typeof value === "string" ? value : ""}`
      if (typeof value === "string") {
        index += 1
      }
      continue
    }
    if (arg === "--reasoning-effort") {
      const value = argv[index + 1]
      if (isReasoningEffortChoice(value)) {
        reasoningEffort = value
        index += 1
        continue
      }
      reasoningEffortError = `Unsupported reasoning effort: ${typeof value === "string" ? value : ""}`
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
    if (arg === "--api-key") {
      const value = argv[index + 1]
      if (typeof value === "string") {
        xaiApiKey = value
        index += 1
        continue
      }
    }
    if (arg === "--access-token") {
      const value = argv[index + 1]
      if (typeof value === "string") {
        xaiOauthAccessToken = value
        index += 1
        continue
      }
    }
    if (arg === "--refresh-token") {
      const value = argv[index + 1]
      if (typeof value === "string") {
        xaiOauthRefreshToken = value
        index += 1
        continue
      }
    }
    if (arg === "--expires-at") {
      const value = argv[index + 1]
      if (typeof value === "string") {
        xaiOauthExpiresAt = value
        index += 1
        continue
      }
    }
    if (arg === "--expires-in") {
      const value = argv[index + 1]
      if (typeof value === "string") {
        xaiOauthExpiresIn = value
        index += 1
        continue
      }
    }
    if (arg === "--token-endpoint") {
      const value = argv[index + 1]
      if (typeof value === "string") {
        xaiOauthTokenEndpoint = value
        index += 1
        continue
      }
    }
    if (arg === "--token-type") {
      const value = argv[index + 1]
      if (typeof value === "string") {
        xaiOauthTokenType = value
        index += 1
        continue
      }
    }
    if (arg === "--agent") {
      const value = argv[index + 1]
      if (typeof value === "string") {
        agent = value
        index += 1
        continue
      }
    }
    if (arg === "--tier") {
      const value = argv[index + 1]
      if (value === "default" || value === "fast") {
        tier = value
        index += 1
        continue
      }
      if (typeof value === "string") {
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
    installOnly: argv.includes("--install-only"),
    noTui: argv.includes("--no-tui"),
    noProbe: argv.includes("--no-probe"),
    preset,
    presetError,
    codingToolAdapter,
    codingToolAdapterExplicit,
    codingToolAdapterError,
    backendEngine,
    backendEngineExplicit,
    backendEngineError,
    reasoningEffort,
    reasoningEffortError,
    baseUrl,
    xaiApiKey,
    xaiOauthAccessToken,
    xaiOauthRefreshToken,
    xaiOauthExpiresAt,
    xaiOauthExpiresIn,
    xaiOauthTokenEndpoint,
    xaiOauthTokenType,
    agent,
    tier,
    positional,
  }
}

function isSetupPreset(value: unknown): value is SetupPreset {
  return value === "auto" || value === "grok"
}

function isReasoningEffortChoice(value: unknown): value is ReasoningEffortChoice {
  return value === "auto" || value === "low" || value === "medium" || value === "high" || value === "xhigh"
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
    "lfg - launch the selected coding tool with lfg Grok adapter support",
    "",
    "Commands:",
    "  lfg",
    "  lfg setup",
    "  lfg setup config",
    "  lfg --json uninstall [--dry-run] [--yes] [--keep-config] [--keep-overrides] [--cwd PATH] [--purge-project-orchestrator]",
    "  lfg doctor                                 # verify install + Codex requirement + optional topology tools",
    "  lfg accounts                                # Clack account manager",
    "  lfg --json accounts list|add|remove|use|rotate|status|enable|disable [--name NAME] [--from-auth PATH]",
    "  lfg set-tier --agent <name> --tier default|fast  # flip model-id tier (Grok has no service_tier host field)",
    "  lfg xai auth status",
    "  lfg xai auth detect [--base-url URL] [--no-probe]",
    "    (algorithm: collect → normalize → score → probe → select)",
    "  lfg xai auth set-api-key [--api-key KEY] [--base-url URL] [--no-probe]",
    "    (omit --api-key to auto-select via detection algorithm)",
    "  lfg xai auth set-oauth --access-token TOKEN --refresh-token TOKEN --expires-at ISO_TIME",
    "  lfg xai auth logout",
    "  lfg mcp companion status|install|uninstall   # independent @islee23520/lfg-mcp plugin",
    "  lfg claude inventory|skills|plugins          # read Claude Code plugins + skills",
    "  lfg claude skill <name> [--body]             # Claude skill metadata / SKILL.md",
    "  lfg claude plugin <name>                     # Claude plugin metadata",
    "  lfg --json handoff plan [flags]               # plan Codex handoff (registers orchestrator thread)",
    "  lfg --json plan start-work [--plan PATH] [--focus TEXT]  # dry-run Codex $start-work launch",
    "  lfg --json plan goal --focus TEXT [--cwd PATH]  # sync goal to Codex App thread (app-server)",
    "  lfg --json goal board|drive|poll [flags]         # ulw-loop board + Codex App drive/passive RESULT poll",
    "  lfg --json plan ulw-plan --focus TEXT [--cwd PATH]  # dry-run Codex $ulw-plan launch",
    "  lfg --json orchestrator status|ask|thread|poll|answer  # multi-Codex CEO inbox under .omo/orchestrator",
    "  lfg ulw-loop <subcommand>                    # durable .omo/ulw-loop CLI",
    "  lfg ulw <subcommand>                         # alias for ulw-loop",
    "",
    "Package execution:",
    "  npx @islee23520/lfg",
    "  npx @islee23520/lfg setup",
    "",
    "Launch:",
    "  lfg                         # launches GrokBuild (Grok-only; requires lfg setup)",
    "  lfg --json                  # prints the Grok launch plan without spawning",
    "",
    "Automation:",
    "  lfg setup                                  # TUI: requires Codex CLI; aborts before writes when absent",
    "  lfg --json setup",
    "  lfg --json setup --run",
    "  lfg setup --run",
    "  lfg --json doctor",
    "  lfg doctor",
    "  lfg --json set-tier --agent <name> --tier default|fast",
    "  lfg set-tier --agent <name> --tier default|fast",
    "  lfg --json setup --preset auto",
    "  lfg --json setup --preset grok",
    "  lfg --json setup --reasoning-effort auto|low|medium|high|xhigh",
    "  lfg --json setup --run --backend-engine grok|codex",
    "  lfg --json setup --run --force",
    "  lfg --json setup --run --install-only",
    "  lfg setup --run --install-only",
    "  lfg --json setup --refresh",
    "  lfg --json setup --refresh --run",
    "  lfg setup --refresh --run",
    "  lfg setup --no-tui",
    "  lfg setup config  # TUI for per-agent model routing overrides",
    "  (models auto: ~/.grok [endpoints].models_base_url or http://127.0.0.1:8317/v1)",
    "  TTY bare setup uses a Clack-based TUI (LFP-style framing) with line fallback; --no-tui forces classic readline.",
    "",
    "Refresh (model list + context windows + safe model auth):",
    "  Re-discovers models from the current base URL (proxy + public LiteLLM catalog for context sizes),",
    "  then writes fresh [model.*] sections (including grok-build alias) and omo.models into ~/.grok/config.toml.",
    "  Does not touch the Grok plugin tree, hooks, or agent TOMLs. Existing prior context_window values are preserved",
    "  when the current discovery does not advertise a size for a model. OPENAI_API_KEY/XAI_API_KEY, or the active",
    "  Codex provider token when env is unset, is written only for single-endpoint discovery; multi-provider",
    "  discovery omits the single global key from provider-scoped model sections.",
    "",
    "Install-only update:",
    "  lfg setup --run --install-only refreshes only the lfg-owned Grok plugin payload under ~/.grok/plugins/lfg.",
    "  It skips model config, OMO/LazyCodex agent override files, roles, prompts, and subagent model settings.",
    "",
    "Setup run implementation:",
    `  ${INTERNAL_GROK_INSTALL_COMMAND}`,
    "  Codex CLI is required. LazyCodex is a bundled handoff facade and is never installed or run by setup.",
  ].join("\n")
}

process.exit(await main(process.argv.slice(2)))
