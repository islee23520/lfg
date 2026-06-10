#!/usr/bin/env node
import { unsupportedCommand } from "./lfg-command"
import { runInstallWizard } from "./lfg-interactive"
import { LAZYCODEX_INSTALLER_COMMAND, runLazycodexInstaller } from "./lfg-installer"
import { INTERNAL_GROK_INSTALL_COMMAND } from "../grok-install/run-grok-install"
import { runGrokDoctor } from "../grok-install/doctor"
import { inspectProjectLocalGrok } from "../grok-install/project-local"
import { homedir } from "node:os"
import { modelDiscoveryPlan, type ModelDiscovery } from "./lfg-models"
import { resolveSetupDiscovery } from "../grok-install/resolve-setup-discovery"
import { isRecord, type JsonObject } from "./lfg-json"

type ParsedArgs = {
  readonly json: boolean
  readonly run: boolean
  readonly baseUrl: string | null
  readonly positional: readonly string[]
}

async function main(argv: readonly string[]): Promise<number> {
  const parsed = parseArgs(argv)
  try {
    const result = await dispatch(parsed)

    // Bare `lfg setup` (the human guided command, no --json no --run) must never dump a raw
    // plan object or full status JSON as primary output. The wizard owns the entire conversation:
    // header, auto-discovered models, short questions (role customize? + final confirm), the
    // "Direct Grok install..." notice, and human success/failure lines.
    const isBareInteractiveSetup =
      !parsed.json && !parsed.run &&
      parsed.positional[0] === "setup" && parsed.positional.length === 1

    if (parsed.json) {
      // --json is the machine/automation surface. Always emit the structured value.
      emit(result, true)
    } else if (parsed.run) {
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
  const [command, subcommand] = args.positional
  if (!command || command === "help" || command === "--help" || command === "-h") {
    return help()
  }
  if (command === "doctor" && !subcommand) {
    const registryVersion = process.env.LFG_DOCTOR_REGISTRY_VERSION ?? null
    return runGrokDoctor({
      home: process.env.HOME ?? homedir(),
      moduleUrl: import.meta.url,
      registryVersion: registryVersion && registryVersion.length > 0 ? registryVersion : null,
    })
  }
  if (command === "project-local" && !subcommand) {
    const projectRoot = process.env.LFG_PROJECT_ROOT ?? process.cwd()
    const inspected = await inspectProjectLocalGrok({ projectRoot })
    return { command: "project-local", lfgIsPlugin: false, ...inspected }
  }
  if (command !== "setup" || subcommand) {
    return unsupportedCommand(args.positional)
  }
  const home = process.env.HOME ?? homedir()
  const resolved = await resolveSetupDiscovery({ home, cliBaseUrl: args.baseUrl })
  if (args.run) {
    return runLazycodexInstaller(resolved.discovery)
  }
  const plan = setupPlan(resolved)
  return args.json ? plan : runInstallWizard(plan, resolved)
}

function isInteractiveInstall(args: ParsedArgs): boolean {
  return !args.json && !args.run && args.positional[0] === "setup" && args.positional.length === 1
}

function setupPlan(resolved: Awaited<ReturnType<typeof resolveSetupDiscovery>>): JsonObject {
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
    executed: false,
    dryRun: false,
    lfgIsPlugin: false,
    skippedCodexInstaller: true,
    installPath: "grok",
    purpose: "Grok-first direct install of the omo/lazycodex adapter into Grok Build. Materializes the full tree as a REAL owned directory at ~/.grok/installed-plugins/lfg (rm -rf any symlink or legacy entry first — never a pointer into ~/.codex). Applies Grok hooks, agents + LFP-style overrides, and model config directly on Grok surfaces. `npx lazycodex-ai install` (Codex path) is NOT executed on the default path.",
    modelDiscovery: discovery ?? modelDiscoveryPlan(),
    modelDiscoverySource: resolved.baseUrlSource,
    modelsBaseUrlUsed: resolved.baseUrlUsed,
    autoModelAliases: discovery !== null,
    steps: [
      { id: 1, status: discovery === null ? "pending" : "done", text: "Discover OpenAI-compatible models (CLI/env/config.toml/default proxy) that will be used for Grok [model.*] aliases and the explorer/reasoning/coding agents." },
      { id: 2, status: discovery === null ? "pending" : "done", text: "Build the Grok agent role configs and LFP-style per-agent overrides from the discovered models + bundled omo defaults." },
      { id: 3, status: "pending", text: `Direct materialization via ${INTERNAL_GROK_INSTALL_COMMAND}: rm -rf ~/.grok/installed-plugins/lfg (guarantees a real directory owned by lfg, kills any symlink), cp the full omo/lazycodex plugin tree (from LFG_LAZYCODEX_PLUGIN_SOURCE, npm _npx cache of lazycodex-ai, or built-in fixture), write lfg-install.json stamp with platform:"grok".` },
      { id: 4, status: "pending", text: `Post-install on the real lfg/ tree via ${INTERNAL_GROK_INSTALL_COMMAND}: register Grok-compatible hooks (with GROK_PLUGIN_ROOT rewriting), sync agents to ~/.grok/agents/*.toml, write lazcodex-agent-overrides.json, update ~/.grok/config.toml with lfg-owned sections, ensure the adapter is enabled for Grok Build.` },
    ],
    note: "Grok-first. Default `lfg setup` (and --json setup) does not execute `npx lazycodex-ai install`. The legacyCodexInstallerCommand is kept only for reference (optional separate Codex bootstrap). Everything lives under ~/.grok as a real directory.",
  }
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const positional: string[] = []
  let baseUrl: string | null = null
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--json" || arg === "--run") {
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
  return { json: argv.includes("--json"), run: argv.includes("--run"), baseUrl, positional }
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
    "  (models auto: ~/.grok [endpoints].models_base_url or http://127.0.0.1:8317/v1)",
    "  lfg --json doctor",
    "  lfg --json project-local",
    "",
    "Setup runs:",
    `  ${LAZYCODEX_INSTALLER_COMMAND}`,
    `  ${INTERNAL_GROK_INSTALL_COMMAND}`,
  ].join("\n")
}

process.exit(await main(process.argv.slice(2)))
