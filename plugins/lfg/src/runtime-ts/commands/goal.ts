import { commandEnv, flagString, listJsonIds, parseArgs, readJsonRecord, stateCollectionDir, stateFile, utcNow, writeJson, type CommandContext, type JsonRecord } from "./common"

type GoalStatus = "active" | "completed" | "cancelled"
type GoalRecord = {
  id: string
  objective: string
  status: GoalStatus
  created_at: string
  updated_at: string
  evidence: string
}

export async function goalCommand(argv: string[], context: CommandContext = {}): Promise<JsonRecord> {
  const subcommand = argv[0] ?? "list"
  if (subcommand === "create") return goalCreateCommand(argv.slice(1), context)
  if (subcommand === "status") return goalStatusCommand(argv.slice(1), context)
  if (subcommand === "list") return goalListCommand(context)
  return { ok: false, command: "goal", subcommand, error: `unknown goal command: ${subcommand}` }
}

export async function goalCreateCommand(argv: string[], context: CommandContext = {}): Promise<JsonRecord> {
  const parsed = parseArgs(argv)
  const id = flagString(parsed, "id")
  const objective = flagString(parsed, "objective") ?? parsed.positional.join(" ").trim()
  if (!id || !objective) return { ok: false, command: "goal create", error: "usage: goal create --id <id> --objective <objective>" }
  const now = utcNow(context.now)
  const goal: GoalRecord = { id, objective, status: "active", created_at: now, updated_at: now, evidence: "goal-create=ok" }
  await writeJson(stateFile(commandEnv(context), "goals", id), goalResponse("goal create", goal))
  return goalResponse("goal create", goal)
}

export async function goalStatusCommand(argv: string[], context: CommandContext = {}): Promise<JsonRecord> {
  const id = flagString(parseArgs(argv), "id")
  if (!id) return { ok: false, command: "goal status", error: "usage: goal status --id <id>" }
  const goal = await loadGoal(id, context)
  if (!goal) return { ok: false, command: "goal status", id, error: `goal not found: ${id}` }
  return goalResponse("goal status", goal)
}

export async function goalListCommand(context: CommandContext = {}): Promise<JsonRecord> {
  const env = commandEnv(context)
  const ids = await listJsonIds(stateCollectionDir(env, "goals"))
  const goals = (await Promise.all(ids.map((id) => loadGoal(id, context)))).filter((goal): goal is GoalRecord => goal !== null)
  return { ok: true, command: "goal list", count: goals.length, goals: goals.map((goal) => goalResponse("goal", goal)), evidence: "goal-list=ok" }
}

async function loadGoal(id: string, context: CommandContext): Promise<GoalRecord | null> {
  const record = await readJsonRecord(stateFile(commandEnv(context), "goals", id))
  if (!record) return null
  return {
    id: typeof record.id === "string" ? record.id : id,
    objective: typeof record.objective === "string" ? record.objective : "",
    status: toGoalStatus(record.status),
    created_at: typeof record.created_at === "string" ? record.created_at : "",
    updated_at: typeof record.updated_at === "string" ? record.updated_at : "",
    evidence: typeof record.evidence === "string" ? record.evidence : "",
  }
}

function goalResponse(command: string, goal: GoalRecord): JsonRecord {
  return { ok: true, command, id: goal.id, objective: goal.objective, status: goal.status, created_at: goal.created_at, updated_at: goal.updated_at, evidence: goal.evidence }
}

function toGoalStatus(value: unknown): GoalStatus {
  return value === "completed" || value === "cancelled" ? value : "active"
}
