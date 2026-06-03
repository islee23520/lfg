#!/usr/bin/env bun
import { access, stat } from "node:fs/promises"
import { join, resolve } from "node:path"
import { commandPath, SUPPORTED_COMMANDS, unsupportedCommand } from "./lfg-command"
import { configureGrokByokFromEnv, grokByokPlan } from "./lfg-config"
import { detectLazycodexAdapter, grokSurfaces, grokVerificationCommands } from "./lfg-grok"
import { runInstallWizard } from "./lfg-interactive"
import { LAZYCODEX_INSTALLER_COMMAND, runLazycodexInstaller } from "./lfg-installer"
import { isRecord, readJson, readJsonObject, type JsonObject } from "./lfg-json"

type LfgEnv = { readonly root: string; readonly data: string; readonly stateDir: string; readonly launcher: string }
type ParsedArgs = { readonly json: boolean; readonly run: boolean; readonly positional: readonly string[] }

const STATE_SCHEMA_VERSION = 2

async function main(argv: readonly string[]): Promise<number> {
  const parsed = parseArgs(argv)
  try {
    const result = await dispatch(parsed)
    if (!isInteractiveInstall(parsed)) emit(result, parsed.json)
    return isFailure(result) ? 1 : 0
  } catch (error) {
    emit({ ok: false, status: "error", error: error instanceof Error ? error.message : String(error) }, true)
    return 1
  }
}

function isInteractiveInstall(args: ParsedArgs): boolean {
  if (args.json || args.run) return false
  const [command, subcommand] = args.positional
  return command === "install" || (command === "lazycodex" && subcommand === "install")
}

async function dispatch(args: ParsedArgs): Promise<unknown> {
  const [command, subcommand, third, fourth] = args.positional
  if (command === "install") return installCommand(args)
  if (!command || command === "status") return status()
  if (command === "doctor") {
    if (subcommand === "state" && third === "schema" && fourth === "check") return doctorStateSchemaCheck()
    return doctor()
  }
  if (command === "config") {
    if (!subcommand || subcommand === "grok-byok") return grokByokCommand(args)
  }
  if (command === "lazycodex") {
    if (!subcommand || subcommand === "status") return lazycodexStatus()
    if (subcommand === "install") return installCommand(args)
  }
  if (command === "setup") {
    if (!subcommand || subcommand === "install-plan") return setupInstallPlan()
    if (subcommand === "show") return setupShow()
  }
  if (command === "help" || command === "--help" || command === "-h") return help()
  return unsupportedCommand(args.positional)
}

async function installCommand(args: ParsedArgs): Promise<unknown> {
  if (args.run) return runLazycodexInstaller()
  const plan = lazycodexInstallPlan()
  return args.json ? plan : runInstallWizard(plan)
}

async function grokByokCommand(args: ParsedArgs): Promise<unknown> {
  if (args.run) return configureGrokByokFromEnv()
  return grokByokPlan()
}

async function status(): Promise<JsonObject> {
  const env = resolveLfgEnv()
  return {
    ok: true,
    product: "lfg",
    purpose: "Install lazycodex Codex adapter for grok-build",
    role: "lazycodex_adapter_installer",
    lfgIsPlugin: false,
    version: await readPluginVersion(env),
    launcher: env.launcher,
    helperRoot: env.root,
    helperData: env.data,
    repo: await detectRepo(),
    lazycodex: lazycodexInstallPlan(),
    grokByok: grokByokPlan(),
  }
}

async function doctor(): Promise<JsonObject> {
  const env = resolveLfgEnv()
  const schema = await inspectStateSchema(env)
  const checks: JsonObject[] = []
  const add = (name: string, ok: boolean, evidence: string, required = true): void => {
    checks.push({ name, ok, required, evidence })
  }

  const adapter = detectLazycodexAdapter()
  add("adapter_manifest", adapter.found, adapter.manifest, false)
  add("adapter_mcp_config", await pathExists(adapter.mcpConfig), adapter.mcpConfig, false)
  add("adapter_skills", await directoryExists(adapter.skillsDir), adapter.skillsDir, false)
  for (const [exe, required] of [["npx", true], ["grok", false]] as const) {
    const found = commandPath(exe)
    add(`exe:${exe}`, Boolean(found), found ?? "not found", required)
  }
  add("helper_data", await directoryExists(env.data) || await directoryExists(resolve(env.data, "..")), env.data)
  add("state_schema", schema.version === STATE_SCHEMA_VERSION, `virtual schema version=${schema.version}; no local write`)
  add("cli", await pathExists(join(env.root, "bin", "lfg.ts")), join(env.root, "bin", "lfg.ts"))

  const failedRequired = checks.filter((check) => check.required === true && check.ok !== true)
  const warnings = checks.filter((check) => check.required !== true && check.ok !== true)
  return { ok: failedRequired.length === 0, status: failedRequired.length === 0 ? "pass" : "fail", helperRoot: env.root, helperData: env.data, lfgIsPlugin: false, adapter, installer: lazycodexInstallPlan(), checks, failedRequired, warnings }
}

async function doctorStateSchemaCheck(): Promise<JsonObject> {
  const env = resolveLfgEnv()
  const schema = await inspectStateSchema(env)
  return { ok: true, status: "pass", operation: "doctor_state_schema_check", schema, stateRoots: { state: env.stateDir }, migrationStatus: schema.migrationStatus, migrations: schema.migrations }
}

function lazycodexStatus(): JsonObject {
  return {
    ok: true,
    status: "ready",
    command: "lazycodex status",
    role: "lazycodex_adapter_installer",
    adapterPackage: "lazycodex-ai",
    purpose: "Install lazycodex Codex adapter for grok-build",
    primaryAction: LAZYCODEX_INSTALLER_COMMAND,
    grokBuildUse: true,
    lfgIsPlugin: false,
    grokSurfaces: grokSurfaces(),
    verificationCommands: grokVerificationCommands(),
    adapter: detectLazycodexAdapter(),
    install: lazycodexInstallPlan(),
  }
}

function lazycodexInstallPlan(): JsonObject {
  const adapter = detectLazycodexAdapter()
  return {
    ok: true,
    status: "planned",
    command: "lazycodex install",
    role: "lazycodex_adapter_installer",
    adapterPackage: "lazycodex-ai",
    installerCommand: LAZYCODEX_INSTALLER_COMMAND,
    executed: false,
    mutatesGlobalConfig: false,
    optionalGrokByokConfig: grokByokPlan(),
    grokBuildUse: true,
    lfgIsPlugin: false,
    adapterRoot: adapter.root,
    adapterManifest: adapter.manifest,
    grokSurfaces: grokSurfaces(),
    verificationCommands: grokVerificationCommands(),
    adapter,
    steps: [
      { id: "run_npm_installer", status: "pending", text: `Run ${LAZYCODEX_INSTALLER_COMMAND}.` },
      { id: "use_lazycodex_adapter", status: "pending", text: "Use lazycodex through Grok custom model, agent/persona, ACP, plugin, or MCP config surfaces when running grok-build." },
      { id: "verify_lazycodex_adapter", status: "pending", text: "Confirm Grok can see lazycodex with grok models, grok inspect --json, and plugin commands where applicable." },
    ],
  }
}

async function setupInstallPlan(): Promise<JsonObject> {
  const env = resolveLfgEnv()
  const install = lazycodexInstallPlan()
  const installSteps = Array.isArray(install.steps) ? install.steps : []
  const record = {
    status: "planned",
    updatedAt: utcNow(),
    purpose: "Install lazycodex Codex adapter for grok-build",
    steps: installSteps.map((step, index) => ({ id: index + 1, key: isRecord(step) ? step.id : undefined, status: isRecord(step) ? step.status : undefined, text: isRecord(step) ? step.text : undefined })),
    lazycodex: { adapterPackage: install.adapterPackage, mutatesGlobalConfig: false, installerCommand: install.installerCommand, lfgIsPlugin: false, adapterRoot: install.adapterRoot, grokSurfaces: install.grokSurfaces },
    grokByok: grokByokPlan(),
  }
  return record
}

async function setupShow(): Promise<unknown> {
  return readJson(setupPath(resolveLfgEnv()), { setup: [] })
}

async function inspectStateSchema(env: LfgEnv): Promise<JsonObject> {
  const path = stateSchemaPath(env)
  const current = await readJsonObject(path)
  const previous = typeof current.version === "number" ? current.version : null
  const now = utcNow()
  const schema = {
    name: "lfg-state",
    version: STATE_SCHEMA_VERSION,
    createdAt: typeof current.createdAt === "string" ? current.createdAt : now,
    updatedAt: now,
    stateDir: env.stateDir,
    runsDir: join(env.data, "runs"),
    migrations: previous === STATE_SCHEMA_VERSION ? [] : [{ id: `state-schema-v${previous ?? 0}-to-${STATE_SCHEMA_VERSION}`, ts: now, from: previous, to: STATE_SCHEMA_VERSION, status: "pending" }],
    migrationStatus: previous === STATE_SCHEMA_VERSION ? "current" : "not_written",
    roots: ["state"],
  }
  return schema
}

function resolveLfgEnv(): LfgEnv {
  const cwd = process.cwd()
  const root = resolve(process.env.GROK_PLUGIN_ROOT ?? resolve(cwd, "plugins", "lfg"))
  const data = resolve(process.env.GROK_PLUGIN_DATA ?? join(cwd, ".lfg"))
  return { root, data, stateDir: join(data, "state"), launcher: process.env.LFG_LAUNCHER ?? "lfg" }
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const positional = argv.filter((arg) => arg !== "--json" && arg !== "--run")
  return { json: argv.includes("--json"), run: argv.includes("--run"), positional }
}

function emit(value: unknown, json: boolean): void {
  if (json || typeof value !== "string") {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
    return
  }
  process.stdout.write(`${value}\n`)
}

function isFailure(value: unknown): boolean {
  return isRecord(value) && value.ok === false
}

function help(): string {
  return ["lfg - install lazycodex for Grok Build", "", "Primary command:", "  lfg install", "", "Automation:", "  lfg --json install", "  lfg --json install --run", "  lfg --json config grok-byok", "  lfg --json config grok-byok --run", "", "Other commands:", ...SUPPORTED_COMMANDS.filter((command) => command !== "install").map((command) => `  lfg ${command}`)].join("\n")
}

async function readPluginVersion(env: LfgEnv): Promise<string | null> {
  const manifest = await readJsonObject(join(env.root, "package.json"))
  return typeof manifest.version === "string" ? manifest.version : null
}

async function detectRepo(): Promise<JsonObject> {
  const root = process.cwd()
  return { root, isGit: await directoryExists(join(root, ".git")) }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function directoryExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

function setupPath(env: LfgEnv): string {
  return join(env.stateDir, "setup.json")
}

function stateSchemaPath(env: LfgEnv): string {
  return join(env.stateDir, "schema.json")
}

function utcNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z")
}

process.exit(await main(Bun.argv.slice(2)))
