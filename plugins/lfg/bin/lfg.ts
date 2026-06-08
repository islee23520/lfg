#!/usr/bin/env node
import { unsupportedCommand } from "./lfg-command"
import { runInstallWizard } from "./lfg-interactive"
import { LAZYCODEX_INSTALLER_COMMAND, runLazycodexInstaller } from "./lfg-installer"
import { INTERNAL_GROK_INSTALL_COMMAND } from "../grok-install/run-grok-install"
import { runGrokDoctor } from "../grok-install/doctor"
import { homedir } from "node:os"
import { fetchModelDiscovery, modelDiscoveryPlan, type ModelDiscovery } from "./lfg-models"
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
    if (!isInteractiveInstall(parsed)) emit(result, parsed.json)
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
    return runGrokDoctor({ home: process.env.HOME ?? homedir(), moduleUrl: import.meta.url })
  }
  if (command !== "setup" || subcommand) {
    return unsupportedCommand(args.positional)
  }
  const discovery = args.baseUrl === null ? null : await fetchModelDiscovery(args.baseUrl)
  if (args.run) {
    return runLazycodexInstaller(discovery)
  }
  const plan = setupPlan(discovery)
  return args.json ? plan : runInstallWizard(plan)
}

function isInteractiveInstall(args: ParsedArgs): boolean {
  return !args.json && !args.run && args.positional[0] === "setup" && args.positional.length === 1
}

function setupPlan(discovery: ModelDiscovery | null): JsonObject {
  return {
    ok: true,
    status: "planned",
    command: "setup",
    role: "lazycodex_adapter_installer",
    adapterPackage: "lazycodex-ai",
    companionPackage: "lfg-grok-install",
    installerCommand: LAZYCODEX_INSTALLER_COMMAND,
    grokInstallerCommand: INTERNAL_GROK_INSTALL_COMMAND,
    lfpInstallerCommand: INTERNAL_GROK_INSTALL_COMMAND,
    packageExecutors: ["npx @islee23520/lfg"],
    executed: false,
    dryRun: false,
    lfgIsPlugin: false,
    purpose: "Install lazycodex-ai and internal Grok adapter extensions through the npm package surface.",
    modelDiscovery: discovery ?? modelDiscoveryPlan(),
    steps: [
      { id: 1, status: discovery === null ? "pending" : "done", text: "Fetch the OpenAI-compatible /v1/models list." },
      { id: 2, status: discovery === null ? "pending" : "done", text: "Map available model ids to default, fast, reasoning, and coding roles." },
      { id: 3, status: "pending", text: `Run ${LAZYCODEX_INSTALLER_COMMAND}.` },
      { id: 4, status: "pending", text: `Run ${INTERNAL_GROK_INSTALL_COMMAND}.` },
    ],
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
    "  lfg --json setup --base-url http://127.0.0.1:11434",
    "  lfg --json setup --run",
    "  lfg --json doctor",
    "",
    "Setup runs:",
    `  ${LAZYCODEX_INSTALLER_COMMAND}`,
    `  ${INTERNAL_GROK_INSTALL_COMMAND}`,
  ].join("\n")
}

process.exit(await main(process.argv.slice(2)))
