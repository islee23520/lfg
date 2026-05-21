#!/usr/bin/env bun
import { agentsInspect, agentsList } from "../src/runtime-ts/commands/agents"
import { authLogin } from "../src/runtime-ts/commands/auth"
import { doctor, doctorStateSchemaCheck } from "../src/runtime-ts/commands/doctor"
import { modelsShow } from "../src/runtime-ts/commands/models"
import { providerAdd, providerList, providerShow } from "../src/runtime-ts/commands/provider"
import { setup, setupCheck, setupInstallPlan, setupShow } from "../src/runtime-ts/commands/setup"
import { status } from "../src/runtime-ts/commands/status"
import { asString, type JsonObject } from "../src/runtime-ts/commands/common"

type ParsedArgs = { json: boolean; positional: string[]; flags: Record<string, string | boolean> }

async function main(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv)
  try {
    const result = await dispatch(parsed, argv)
    emit(result, parsed.json)
    return isFailure(result) ? 1 : 0
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (parsed.json) emit({ ok: false, status: "error", error: message }, true)
    else console.error(message)
    return 1
  }
}

async function dispatch(args: ParsedArgs, rawArgv: string[]): Promise<unknown> {
  const [command, subcommand, third] = args.positional
  const rawAfterCommand = (cmd: string) => { const idx = rawArgv.indexOf(cmd); return idx >= 0 ? rawArgv.slice(idx + 1) : args.positional.slice(1) }
  if (!command || command === "status") return status({ argv0: Bun.argv[1] })
  if (command === "doctor") {
    if (subcommand === "state" && third === "schema" && args.positional[3] === "check") return doctorStateSchemaCheck()
    return doctor()
  }
  if (command === "agents") {
    if (subcommand === "list") return agentsList({ ids: Boolean(args.flags.ids ?? args.flags.completion), json: args.json })
    if (subcommand === "inspect") return agentsInspect({ agentId: required(args.positional[2], "agents inspect requires <id>"), category: flagString(args, "category"), provider: flagString(args, "provider"), model: flagString(args, "model"), reasoning: flagString(args, "reasoning") })
  }
  if (command === "models") return modelsShow({ provider: flagString(args, "provider") })
  if (command === "auth" && subcommand === "login") return authLogin({ provider: required(args.positional[2], "auth login requires <provider>"), id: flagString(args, "id"), env: flagString(args, "env"), model: flagString(args, "model") })
  if (command === "provider") {
    if (subcommand === "list") return providerList()
    if (subcommand === "show") return providerShow({ id: required(args.positional[2], "provider show requires <id>") })
    if (subcommand === "add") return providerAdd({ id: required(flagString(args, "id"), "provider add requires --id"), kind: required(flagString(args, "kind"), "provider add requires --kind"), env: flagString(args, "env"), model: flagString(args, "model"), transport: flagString(args, "transport"), authScheme: flagString(args, "auth-scheme") ?? flagString(args, "authScheme") })
  }
  if (command === "setup") {
    if (subcommand === "check") return setupCheck()
    if (subcommand === "install-plan") return setupInstallPlan({ marketplace: flagString(args, "marketplace") })
    if (subcommand === "show") return setupShow()
    return setup({ pluginDir: flagString(args, "plugin-dir"), dryRun: Boolean(args.flags["dry-run"]) })
  }
  if (command === "team") return (await import("../src/runtime-ts/commands/team")).teamCommand(rawAfterCommand("team"))
  if (command === "ultrawork") return (await import("../src/runtime-ts/commands/ultrawork")).ultraworkCommand(rawAfterCommand("ultrawork"))
  if (command === "slash") return (await import("../src/runtime-ts/commands/slash")).slashCommand(rawAfterCommand("slash"))
  if (command === "goal") return (await import("../src/runtime-ts/commands/goal")).goalCommand(rawAfterCommand("goal"))
  if (command === "route") return (await import("../src/runtime-ts/commands/route")).routeCommand(rawAfterCommand("route"))
  if (command === "spawn") return (await import("../src/runtime-ts/commands/spawn")).spawnCommand(rawAfterCommand("spawn"))
  if (command === "plan") {
    const planMod = await import("../src/runtime-ts/commands/plan")
    const planArgs = rawAfterCommand("plan")
    if (subcommand === "create") return planMod.planCreateCommand({ objective: args.positional.slice(2).join(" ") || "unnamed plan", steps: flagString(args, "steps")?.split(";").map((s) => s.trim()).filter(Boolean) ?? [] })
    if (subcommand === "list") return planMod.planListCommand({ limit: Number(flagString(args, "limit") ?? "10") })
    return planMod.planListCommand({})
  }
  if (command === "atlas") {
    const atlasMod = await import("../src/runtime-ts/commands/atlas")
    const planId = flagString(args, "plan-id") ?? flagString(args, "planId")
    if (subcommand === "start-work") return atlasMod.atlasStartWorkCommand({ planId, plan_id: planId })
    if (subcommand === "status") return atlasMod.atlasStatusCommand({ planId, plan_id: planId })
    if (subcommand === "checkbox") return atlasMod.atlasCheckboxCommand({ planId, plan_id: planId, task: Number(args.positional[2] ?? 0), status: args.positional[3] ?? "complete", evidence: flagString(args, "evidence") })
    return atlasMod.atlasStatusCommand({ planId, plan_id: planId })
  }
  if (command === "boulder") {
    const boulderMod = await import("../src/runtime-ts/commands/boulder")
    if (subcommand === "status") return boulderMod.boulderStatusCommand()
    if (subcommand === "set-goal") return boulderMod.boulderSetGoalCommand({ goal: args.positional.slice(2).join(" ") || "unnamed goal" })
    if (subcommand === "add-evidence") return boulderMod.boulderAddEvidenceCommand({ evidence: args.positional.slice(2).join(" ") || "checkpoint", taskId: flagString(args, "task-id") })
    if (subcommand === "add-blocker") return boulderMod.boulderAddBlockerCommand({ blocker: args.positional.slice(2).join(" ") || "unspecified blocker", code: flagString(args, "code") })
    return boulderMod.boulderStatusCommand()
  }
  if (command === "hyperplan") return (await import("../src/runtime-ts/commands/hyperplan")).hyperplanCommand(rawAfterCommand("hyperplan"))
  const workflowStubs = await import("../src/runtime-ts/commands/workflow-stubs")
  if (workflowStubs.isWorkflowStubCommand(command)) return workflowStubs.workflowStubCommand(command, args.positional.slice(1))
  throw new Error(`unknown command: ${args.positional.join(" ")}`)
}

function parseArgs(argv: string[]): ParsedArgs {
  const flags: Record<string, string | boolean> = {}
  const positional: string[] = []
  let json = false
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === "--json") { json = true; continue }
    if (token.startsWith("--")) {
      const withoutPrefix = token.slice(2)
      const [key, inlineValue] = withoutPrefix.split("=", 2)
      if (inlineValue !== undefined) flags[key] = inlineValue
      else if (argv[index + 1] && !argv[index + 1].startsWith("--")) { flags[key] = argv[index + 1]; index += 1 }
      else flags[key] = true
      continue
    }
    positional.push(token)
  }
  return { json, positional, flags }
}

function flagString(args: ParsedArgs, name: string): string | undefined {
  return asString(args.flags[name])
}

function required(value: string | undefined, message: string): string {
  if (!value) throw new Error(message)
  return value
}

function emit(value: unknown, json: boolean): void {
  if (!json && isRecord(value) && typeof value._raw_text === "string") console.log(value._raw_text)
  else console.log(JSON.stringify(value, null, 2))
}

function isFailure(value: unknown): boolean {
  return isRecord(value) && value.ok === false
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

if (import.meta.main) process.exit(await main(Bun.argv.slice(2)))

export { dispatch, parseArgs }
