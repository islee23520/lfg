import { join } from "node:path"
import { createTeamRun, TeamStateStore, type TeamMember, type TeamRun } from "../services/team-store"
import { commandEnv, flagBoolean, flagString, parseArgs, utcNow, writeJson, type CommandContext, type JsonRecord } from "./common"

export const TEAM_PROVIDERS = ["hermes", "claude", "codex", "gemini", "copilot", "zai", "opencode", "grok", "subagent", "noop"] as const
export type TeamProvider = typeof TEAM_PROVIDERS[number]

type TeamSpec = { count: number; role: string }

export async function teamCommand(argv: string[], context: CommandContext = {}): Promise<JsonRecord> {
  const subcommand = argv[0] ?? "status"
  if (subcommand === "providers") return teamProvidersCommand()
  if (subcommand === "preflight") return teamPreflightCommand()
  if (subcommand === "create") return teamCreateCommand(argv.slice(1), context)
  if (subcommand === "status") return teamStatusCommand(argv.slice(1), context)
  if (subcommand === "resume") return teamTransitionCommand(argv.slice(1), "running", "resume", context)
  if (subcommand === "shutdown") return teamTransitionCommand(argv.slice(1), "shutdown", "shutdown", context)
  return { ok: false, command: "team", subcommand, error: `unknown team command: ${subcommand}` }
}

export function teamProvidersCommand(): JsonRecord {
  return { ok: true, command: "team providers", providers: [...TEAM_PROVIDERS], default: ["grok", "subagent"], smokeSafe: "noop", smokeSafeProvider: "noop", summary: { count: TEAM_PROVIDERS.length, smokeSafe: "noop", manualGated: ["grok", "subagent"] } }
}

export function teamPreflightCommand(): JsonRecord {
  return {
    ok: true,
    command: "team preflight",
    status: "pass",
    providers: TEAM_PROVIDERS.map((provider) => ({ provider, ok: provider === "noop", available: provider === "noop", smokeSafe: provider === "noop" })),
    evidence: "team-preflight-smoke-safe=ok",
  }
}

export async function teamCreateCommand(argv: string[], context: CommandContext = {}): Promise<JsonRecord> {
  const parsed = parseArgs(argv)
  const specText = parsed.positional[0]
  const objective = parsed.positional[1]
  if (!specText || !objective) return { ok: false, command: "team create", error: "usage: team create <count:role> <objective> [--providers <provider[,provider]>] [--dry-run]" }
  const spec = parseTeamSpec(specText)
  if (!spec) return { ok: false, command: "team create", error: `invalid team spec: ${specText}` }
  const providers = parseProviders(flagString(parsed, "providers") ?? "noop")
  const unknownProviders = providers.filter((provider) => !isTeamProvider(provider))
  if (unknownProviders.length > 0) return { ok: false, command: "team create", error: `unknown provider(s): ${unknownProviders.join(", ")}`, providers: [...TEAM_PROVIDERS] }
  const dryRun = flagBoolean(parsed, "dry-run")
  const teamName = flagString(parsed, "name") ?? `team-${spec.count}-${spec.role}`
  const env = commandEnv(context)
  const store = new TeamStateStore({ env, mode: "team", modeId: teamName, dryRun })
  const run = await createTeamRun(store, teamName, objective, null, { spec: specText, providers, dryRun })
  run.members = buildMembers(spec, objective, providers as TeamProvider[], context)
  run.leader = run.members[0]?.id ?? null
  run.status = dryRun ? "planned" : "running"
  run.updated_at = utcNow(context.now)
  await store.saveRun(run)
  if (!dryRun) await writeJson(join(env.stateDir, "current-team.json"), { name: run.name, id: run.id, statePath: store.runDir(run.id), updatedAt: run.updated_at })
  return teamRunResponse("team create", run, { dryRun, statePath: store.runDir(run.id), evidence: dryRun ? "team-create-dry-run=ok" : "team-create=ok" })
}

export async function teamStatusCommand(argv: string[], context: CommandContext = {}): Promise<JsonRecord> {
  const name = argv[0]
  if (!name) return { ok: false, command: "team status", error: "usage: team status <name>" }
  const store = new TeamStateStore({ env: commandEnv(context), mode: "team", modeId: name })
  const run = await store.loadRun(name)
  if (!run) return { ok: false, command: "team status", name, error: `team not found: ${name}` }
  return teamRunResponse("team status", run, { statePath: store.runDir(run.id), evidence: "team-status=ok" })
}

async function teamTransitionCommand(argv: string[], status: "running" | "shutdown", operation: "resume" | "shutdown", context: CommandContext): Promise<JsonRecord> {
  const name = argv[0]
  if (!name) return { ok: false, command: `team ${operation}`, error: `usage: team ${operation} <name>` }
  const store = new TeamStateStore({ env: commandEnv(context), mode: "team", modeId: name })
  const run = await store.loadRun(name)
  if (!run) return { ok: false, command: `team ${operation}`, name, error: `team not found: ${name}` }
  run.status = status
  run.updated_at = utcNow(context.now)
  if (operation === "shutdown") run.members = run.members.map((member) => ({ ...member, status: "shutdown_requested", shutdown_requested_at: run.updated_at, shutdown_decision: "manual-approved" }))
  await store.saveRun(run)
  return teamRunResponse(`team ${operation}`, run, { statePath: store.runDir(run.id), evidence: `team-${operation}=ok` })
}

function parseTeamSpec(spec: string): TeamSpec | null {
  const [countText, role] = spec.split(":", 2)
  const count = Number(countText)
  if (!Number.isInteger(count) || count < 1 || count > 8 || !role) return null
  return { count, role }
}

function parseProviders(value: string): string[] {
  return value.split(",").map((provider) => provider.trim()).filter(Boolean)
}

function isTeamProvider(provider: string): provider is TeamProvider {
  return TEAM_PROVIDERS.includes(provider as TeamProvider)
}

function buildMembers(spec: TeamSpec, objective: string, providers: TeamProvider[], context: CommandContext): TeamMember[] {
  return Array.from({ length: spec.count }, (_, index) => {
    const id = `${spec.role}-${index + 1}`
    const provider = providers[index % providers.length] ?? "noop"
    return {
      id,
      name: id,
      role: spec.role,
      provider,
      status: provider === "noop" ? "completed" : "pending",
      prompt: objective,
      command: provider === "noop" ? "noop" : `${provider} ${JSON.stringify(objective)}`,
      subagent_id: null,
      ultragoal: null,
      spawned_as_subagent: false,
      spawn_envelope: provider === "noop" ? { ok: true, provider, evidence: "noop-provider-smoke-safe=ok" } : null,
      spawned_as_subagent_status: null,
      subagent_spawn_status: null,
      last_heartbeat: utcNow(context.now),
      kind: "executor",
      session_id: null,
      shutdown_requested_at: null,
      shutdown_decision: null,
    }
  })
}

function teamRunResponse(command: string, run: TeamRun, extra: JsonRecord): JsonRecord {
  return {
    ok: true,
    command,
    team: run.id,
    name: run.name,
    objective: run.objective,
    status: run.status,
    members: run.members.map((member) => ({ id: member.id, role: member.role, provider: member.provider, status: member.status })),
    memberCount: run.members.length,
    ...extra,
  }
}
