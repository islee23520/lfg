import { readFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { asJsonRecord, isJsonRecord, toJsonValue, type JsonRecord, type JsonValue, type McpTool } from "./protocol"

const LEGACY_TOOL_PREFIX = "grok_build_"

export type CommandRunResult = {
  cmd: string[]
  returncode: number
  stdout: string
  stderr: string
}

export type LfgCommandRunner = {
  runRaw(args: string[], options?: { timeoutMs?: number; launcher?: string }): Promise<CommandRunResult>
}

export type ToolDispatcher = {
  tools: McpTool[]
  callTool(name: string, args?: unknown): Promise<JsonRecord>
}

export type ToolDispatcherOptions = {
  root?: string
  data?: string
  runner?: LfgCommandRunner
}

type ToolContext = {
  root: string
  data: string
  runner: LfgCommandRunner
}

type ToolHandler = (args: JsonRecord, context: ToolContext) => Promise<JsonRecord>

const MODULE_DIR = dirname(fileURLToPath(import.meta.url))
export const DEFAULT_PLUGIN_ROOT = resolve(MODULE_DIR, "..", "..")

export async function loadMcpTools(root: string = DEFAULT_PLUGIN_ROOT): Promise<McpTool[]> {
  const raw = await readFile(join(root, "src", "mcp", "tools.json"), "utf8")
  const parsed: unknown = JSON.parse(raw)
  if (!Array.isArray(parsed)) throw new Error("MCP tools.json must contain an array")
  return parsed.map((tool) => normalizeTool(tool))
}

export async function createToolDispatcher(options: ToolDispatcherOptions = {}): Promise<ToolDispatcher> {
  const root = options.root ?? process.env.GROK_PLUGIN_ROOT ?? DEFAULT_PLUGIN_ROOT
  const data = options.data ?? process.env.GROK_PLUGIN_DATA ?? join(process.cwd(), ".lfg")
  const tools = await loadMcpTools(root)
  const canonicalNames = new Set(tools.map((tool) => tool.name))
  const context: ToolContext = { root, data, runner: options.runner ?? new BunLfgRunner(root) }
  return {
    tools,
    async callTool(name, args = {}) {
      const dispatchName = dispatchToolName(name, canonicalNames)
      const handler = HANDLERS[dispatchName]
      if (!handler) throw new Error(dispatchName)
      return handler(asJsonRecord(args), context)
    },
  }
}

export function dispatchToolName(name: unknown, canonicalNames: ReadonlySet<string>): string {
  if (typeof name !== "string" || name.length === 0) throw new Error(String(name))
  if (name.startsWith(LEGACY_TOOL_PREFIX)) return name
  if (!canonicalNames.has(name)) throw new Error(name)
  return `${LEGACY_TOOL_PREFIX}${name}`
}

export class BunLfgRunner implements LfgCommandRunner {
  constructor(private readonly root: string) {}

  async runRaw(args: string[], options: { timeoutMs?: number; launcher?: string } = {}): Promise<CommandRunResult> {
    const launcher = options.launcher ?? "lfg"
    const cmd = [join(this.root, "bin", launcher), "--json", ...args]
    const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe", env: process.env })
    const timeoutMs = options.timeoutMs ?? 30_000
    const timeout = setTimeout(() => proc.kill(), timeoutMs)
    try {
      const [returncode, stdout, stderr] = await Promise.all([
        proc.exited,
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ])
      return { cmd, returncode, stdout, stderr }
    } finally {
      clearTimeout(timeout)
    }
  }
}

function normalizeTool(value: unknown): McpTool {
  const record = asJsonRecord(value)
  if (typeof record.name !== "string") throw new Error("MCP tool is missing name")
  return { name: record.name, description: typeof record.description === "string" ? record.description : undefined, inputSchema: asJsonRecord(record.inputSchema) }
}

function textResult(value: unknown): JsonRecord {
  return { content: [{ type: "text", text: JSON.stringify(toJsonValue(value), null, 2) }] }
}

async function runLfgJson(context: ToolContext, args: string[], timeoutMs = 30_000, launcher = "lfg"): Promise<JsonRecord> {
  const result = await context.runner.runRaw(args, { timeoutMs, launcher })
  const stdout = result.stdout.trim()
  let data: JsonValue = null
  let parseError: string | null = null
  if (stdout) {
    try {
      data = toJsonValue(JSON.parse(stdout))
    } catch (error) {
      parseError = error instanceof Error ? error.message : String(error)
    }
  }
  const ok = result.returncode === 0 && parseError === null
  return { ok, status: ok ? "ok" : "error", cmd: result.cmd, returncode: result.returncode, data, stdout: result.stdout, stderr: result.stderr, stdoutJson: parseError === null, parseError }
}

async function runLfgRawText(context: ToolContext, args: string[], timeoutMs = 30_000, launcher = "lfg"): Promise<JsonRecord> {
  return textResult(await context.runner.runRaw(args, { timeoutMs, launcher }))
}

function stringArg(args: JsonRecord, key: string): string | undefined {
  const value = args[key]
  return typeof value === "string" ? value : undefined
}

function boolArg(args: JsonRecord, key: string, fallback = false): boolean {
  const value = args[key]
  return typeof value === "boolean" ? value : fallback
}

function addOptionalFlags(cmd: string[], args: JsonRecord, flags: Array<[string, string]>): void {
  for (const [key, flag] of flags) {
    const value = args[key]
    if (typeof value === "string" && value.length > 0) cmd.push(flag, value)
  }
}

function appendEvidenceArtifacts(cmd: string[], args: JsonRecord): void {
  const value = args.evidenceArtifactPaths ?? args.evidenceArtifacts
  const paths = typeof value === "string" ? [value] : Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
  for (const path of paths) if (path.length > 0) cmd.push("--evidence-artifact", path)
}

async function catalog(args: JsonRecord, context: ToolContext): Promise<JsonRecord> {
  void args
  const parsed: unknown = JSON.parse(await readFile(join(context.root, "catalog", "omo-skill-map.json"), "utf8"))
  return textResult(parsed)
}

async function status(args: JsonRecord, context: ToolContext): Promise<JsonRecord> {
  void args
  return textResult({ pluginRoot: context.root, pluginData: context.data, catalogExists: await exists(join(context.root, "catalog", "omo-skill-map.json")), skillsDir: join(context.root, "skills"), hooksFile: join(context.root, "hooks", "hooks.json"), runtime: join(context.root, "bin", "lfg") })
}

async function runtime(args: JsonRecord, context: ToolContext): Promise<JsonRecord> {
  const action = stringArg(args, "action")
  const commandMap: Record<string, string[]> = { status: ["status"], catalog: ["catalog"], doctor: ["doctor"], hud: ["hud"], pipeline_list: ["pipeline", "list"], skill_list: ["skill", "list"], plan_list: ["plan", "list"], wiki_list: ["wiki", "list"], backend_status: ["backend", "status"], hook_bridge_status: ["hook-bridge", "status"] }
  if (action === "skill_search") return runLfgRawText(context, ["skill", "search", stringArg(args, "query") ?? ""], 20_000)
  if (action === "wiki_search") return runLfgRawText(context, ["wiki", "search", stringArg(args, "query") ?? ""], 20_000)
  if (action === "team_status") return runLfgRawText(context, ["team", "status", ...(stringArg(args, "team") ? [stringArg(args, "team") ?? ""] : [])], 20_000)
  const command = action ? commandMap[action] : undefined
  if (!command) throw new Error(String(action))
  return runLfgRawText(context, command, 20_000)
}

async function doctor(args: JsonRecord, context: ToolContext): Promise<JsonRecord> {
  void args
  return textResult(await runLfgJson(context, ["doctor"], 30_000))
}

async function hookBridge(args: JsonRecord, context: ToolContext): Promise<JsonRecord> {
  const action = stringArg(args, "action")
  if (action !== "status" && action !== "install") throw new Error(String(action))
  return runLfgRawText(context, ["hook-bridge", action], 30_000)
}

async function backendStart(args: JsonRecord, context: ToolContext): Promise<JsonRecord> {
  const cmd = ["backend", "start"]
  const name = stringArg(args, "name")
  if (name) cmd.push("--name", name)
  return runLfgRawText(context, cmd, 20_000)
}

async function agents(args: JsonRecord, context: ToolContext): Promise<JsonRecord> {
  const action = stringArg(args, "action")
  const cmd = ["agents"]
  if (action === "list") cmd.push("list")
  else if (action === "inspect") {
    cmd.push("inspect", stringArg(args, "agent") ?? "sisyphus")
    addOptionalFlags(cmd, args, [["category", "--category"], ["provider", "--provider"], ["model", "--model"], ["reasoning", "--reasoning"]])
  } else throw new Error(String(action))
  return textResult(await runLfgJson(context, cmd, 20_000))
}

async function spawn(args: JsonRecord, context: ToolContext): Promise<JsonRecord> {
  const agent = stringArg(args, "agent")
  if (!agent) throw new Error("agent")
  const cmd = ["spawn", agent]
  addOptionalFlags(cmd, args, [["category", "--category"], ["task", "--task"], ["provider", "--provider"], ["model", "--model"], ["reasoning", "--reasoning"], ["mode", "--mode"], ["taskId", "--task-id"]])
  return textResult(await runLfgJson(context, cmd, 30_000))
}

async function route(args: JsonRecord, context: ToolContext): Promise<JsonRecord> {
  const cmd = ["route"]
  addOptionalFlags(cmd, args, [["category", "--category"], ["subagentType", "--subagent-type"], ["task", "--task"]])
  return textResult(await runLfgJson(context, cmd, 20_000))
}

async function provider(args: JsonRecord, context: ToolContext): Promise<JsonRecord> {
  const action = stringArg(args, "action")
  const cmd = ["provider"]
  if (action === "list") cmd.push("list")
  else if (action === "show") cmd.push("show", stringArg(args, "id") ?? "default")
  else if (action === "add") {
    cmd.push("add")
    addOptionalFlags(cmd, args, [["id", "--id"], ["kind", "--kind"], ["env", "--env"], ["model", "--model"]])
  } else throw new Error(String(action))
  return textResult(await runLfgJson(context, cmd, 30_000))
}

async function boulder(args: JsonRecord, context: ToolContext): Promise<JsonRecord> {
  const action = stringArg(args, "action") ?? "atlas_status"
  let cmd: string[]
  if (action === "atlas_status") {
    cmd = ["atlas", "status"]
    addOptionalFlags(cmd, args, [["planId", "--plan-id"], ["sessionId", "--session-id"]])
  } else if (action === "ultragoal_show" || action === "ultragoal_status") {
    cmd = ["ultragoal", action === "ultragoal_show" ? "show" : "status"]
    addOptionalFlags(cmd, args, [["ultragoalId", "--id"]])
  } else throw new Error(action)
  return textResult(await runLfgJson(context, cmd, 30_000))
}

async function atlas(args: JsonRecord, context: ToolContext): Promise<JsonRecord> {
  const action = stringArg(args, "action")
  const cmd = ["atlas"]
  if (action === "start-work" || action === "status") {
    cmd.push(action)
    addOptionalFlags(cmd, args, [["planId", "--plan-id"], ["sessionId", "--session-id"]])
  } else if (action === "checkbox") {
    cmd.push("checkbox", "--task", String(args.task ?? "1"), "--status", stringArg(args, "status") ?? "active")
    addOptionalFlags(cmd, args, [["planId", "--plan-id"], ["sessionId", "--session-id"], ["evidence", "--evidence"], ["learning", "--learning"], ["decision", "--decision"], ["issue", "--issue"], ["verification", "--verification"], ["problem", "--problem"]])
    appendEvidenceArtifacts(cmd, args)
  } else throw new Error(String(action))
  return textResult(await runLfgJson(context, cmd, 30_000))
}

async function hyperplan(args: JsonRecord, context: ToolContext): Promise<JsonRecord> {
  const objective = stringArg(args, "objective")
  if (!objective) throw new Error("objective")
  const cmd = ["hyperplan", objective]
  addOptionalFlags(cmd, args, [["runId", "--run-id"], ["teamName", "--team-name"]])
  if (boolArg(args, "noDeep")) cmd.push("--no-deep")
  if (boolArg(args, "dryRun", true)) cmd.push("--dry-run")
  return textResult(await runLfgJson(context, cmd, 45_000))
}

async function team(args: JsonRecord, context: ToolContext): Promise<JsonRecord> {
  const action = stringArg(args, "action")
  const cmd = ["team"]
  if (action === "providers" || action === "list") cmd.push(action)
  else if (action === "preflight") {
    cmd.push("preflight")
    addOptionalFlags(cmd, args, [["team", "--name"]])
  } else if (action === "create") {
    cmd.push("create", stringArg(args, "spec") ?? "3:executor", stringArg(args, "objective") ?? "coordinate LFG team work with verification")
    addOptionalFlags(cmd, args, [["team", "--name"]])
    cmd.push("--providers", stringArg(args, "providers") ?? "grok,subagent")
    if (boolArg(args, "dryRun", true)) cmd.push("--dry-run")
  } else if (action === "status" || action === "resume" || action === "shutdown") {
    cmd.push(action)
    const name = stringArg(args, "team")
    if (name) cmd.push(name)
  } else if (action === "delete") cmd.push("delete", stringArg(args, "team") ?? "")
  else if (action === "send_message") cmd.push("send-message", stringArg(args, "team") ?? "", stringArg(args, "to") ?? "leader", stringArg(args, "body") ?? "")
  else if (action === "task_create") {
    cmd.push("task-create", stringArg(args, "team") ?? "", stringArg(args, "title") ?? "team task")
    addOptionalFlags(cmd, args, [["description", "--description"], ["owner", "--owner"]])
  } else if (action === "task_list") cmd.push("task-list", stringArg(args, "team") ?? "")
  else if (action === "task_update") {
    cmd.push("task-update", stringArg(args, "team") ?? "", stringArg(args, "task") ?? "")
    addOptionalFlags(cmd, args, [["status", "--status"], ["owner", "--owner"], ["evidence", "--evidence"]])
  } else if (action === "task_get") cmd.push("task-get", stringArg(args, "team") ?? "", stringArg(args, "task") ?? "")
  else if (action === "shutdown_request") {
    cmd.push("shutdown-request", stringArg(args, "team") ?? "", stringArg(args, "member") ?? "")
    addOptionalFlags(cmd, args, [["reason", "--reason"]])
  } else if (action === "approve_shutdown") cmd.push("approve-shutdown", stringArg(args, "team") ?? "", stringArg(args, "member") ?? "")
  else if (action === "reject_shutdown") cmd.push("reject-shutdown", stringArg(args, "team") ?? "", stringArg(args, "member") ?? "")
  else throw new Error(String(action))
  const actor = stringArg(args, "actor")
  if (actor && !["providers", "preflight", "status", "list", "resume", "shutdown"].includes(action ?? "")) cmd.push("--actor", actor)
  return runLfgRawText(context, cmd, 30_000)
}

async function ultraworkLike(tool: string, args: JsonRecord, context: ToolContext): Promise<JsonRecord> {
  const action = stringArg(args, "action")
  const cmd = [tool]
  if (action === "create") {
    cmd.push("create", stringArg(args, "objective") ?? `${tool} objective`)
    addOptionalFlags(cmd, args, [["id", "--id"], ["tasks", "--tasks"]])
  } else if (action === "update" || action === "checkpoint" || action === "step" || action === "advance") {
    cmd.push(action, "--status", stringArg(args, "status") ?? "active")
    if (args.task !== undefined) cmd.push("--task", String(args.task))
    if (args.phase !== undefined) cmd.push("--phase", String(args.phase))
    addOptionalFlags(cmd, args, [["id", "--id"], ["evidence", "--evidence"], ["story", "--story"], ["goal_json", "--goal-json"]])
    if (boolArg(args, "force_gate") || boolArg(args, "forceGate")) cmd.push("--force-gate")
    appendEvidenceArtifacts(cmd, args)
  } else if (action === "show" || action === "status") {
    cmd.push(action)
    addOptionalFlags(cmd, args, [["id", "--id"]])
  } else throw new Error(String(action))
  return runLfgRawText(context, cmd, 30_000)
}

async function models(args: JsonRecord, context: ToolContext): Promise<JsonRecord> {
  const action = stringArg(args, "action") ?? "show"
  const cmd = ["models"]
  if (action === "switch") {
    cmd.push("switch", stringArg(args, "model") ?? "grok-build")
    addOptionalFlags(cmd, args, [["provider", "--provider"], ["reasoning", "--reasoning"]])
  } else if (action === "show") {
    cmd.push("show")
    addOptionalFlags(cmd, args, [["provider", "--provider"]])
  } else throw new Error(action)
  return textResult(await runLfgJson(context, cmd, 30_000))
}

async function auth(args: JsonRecord, context: ToolContext): Promise<JsonRecord> {
  if (stringArg(args, "action") !== "login") throw new Error(String(stringArg(args, "action")))
  const providerName = stringArg(args, "provider")
  if (!providerName) throw new Error("provider")
  const cmd = ["auth", "login", providerName]
  addOptionalFlags(cmd, args, [["id", "--id"], ["env", "--env"], ["model", "--model"]])
  return textResult(await runLfgJson(context, cmd, 30_000))
}

async function setup(args: JsonRecord, context: ToolContext): Promise<JsonRecord> {
  const action = stringArg(args, "action")
  const cmd = ["setup"]
  if (action === "check" || action === "show") cmd.push(action)
  else if (action === "install-plan") {
    cmd.push("install-plan")
    addOptionalFlags(cmd, args, [["marketplace", "--marketplace"]])
  } else throw new Error(String(action))
  return runLfgRawText(context, cmd, 30_000)
}

async function plan(args: JsonRecord, context: ToolContext): Promise<JsonRecord> {
  const action = stringArg(args, "action")
  const cmd = ["plan"]
  if (action === "create") {
    cmd.push("create", stringArg(args, "title") ?? "Untitled plan")
    addOptionalFlags(cmd, args, [["steps", "--steps"]])
  } else if (action === "list") cmd.push("list")
  else throw new Error(String(action))
  const payload = await runLfgJson(context, cmd, 30_000)
  if (action === "create" && isJsonRecord(payload.data)) {
    payload.plan = payload.data
    if (isJsonRecord(payload.data.preview)) payload.preview = payload.data.preview
    payload.note = "Rich plan preview ready for popup/card render (full markdown + interactive steps metadata included; self-contained)."
  } else payload.note = "Plan written to .lfg/plans/ (both .json and .md). Open the .md file to work on the plan."
  return textResult(payload)
}

async function simpleActionTool(cliName: string, args: JsonRecord, context: ToolContext): Promise<JsonRecord> {
  const action = stringArg(args, "action")
  const cmd = [cliName]
  if (action) cmd.push(action)
  for (const [key, value] of Object.entries(args)) {
    if (key === "action" || value === null || value === undefined) continue
    if (typeof value === "boolean") { if (value) cmd.push(`--${key.replace(/_/g, "-")}`) }
    else if (typeof value === "string" || typeof value === "number") cmd.push(`--${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`).replace(/_/g, "-")}`, String(value))
  }
  appendEvidenceArtifacts(cmd, args)
  return runLfgRawText(context, cmd, 30_000)
}

async function omoAgentCatalog(args: JsonRecord, context: ToolContext): Promise<JsonRecord> {
  const result = await runLfgJson(context, ["agents", "list"], 20_000)
  const payload = isJsonRecord(result.data) ? result.data : {}
  let agentList = Array.isArray(payload.agents) ? payload.agents.filter(isJsonRecord) : []
  const filter = stringArg(args, "filter") ?? "all"
  if (filter === "eligible_team_members") agentList = agentList.filter((agent) => agent.teamEligibility === "eligible")
  if (filter === "lead_agents" || filter === "hyperplan") {
    const order = filter === "lead_agents" ? ["sisyphus", "hephaestus", "prometheus", "atlas"] : ["sisyphus", "hephaestus", "prometheus", "atlas", "sisyphus-junior"]
    const orderedAgents: JsonRecord[] = []
    for (const id of order) {
      const found = agentList.find((agent) => agent.id === id)
      if (found) orderedAgents.push(found)
    }
    agentList = orderedAgents
  }
  if (!boolArg(args, "with_eligibility", true)) agentList = agentList.map((agent) => stripKeys(agent, ["teamEligibility", "teamMemberEligible", "teamMemberConditional"]))
  return textResult({ ...result, source: "plugins/lfg/src/agents", filter, withEligibility: boolArg(args, "with_eligibility", true), agents: agentList, count: agentList.length })
}

async function omoTeamCreate(args: JsonRecord, context: ToolContext): Promise<JsonRecord> {
  const cmd = ["team", "create", stringArg(args, "spec") ?? "hyperplan", stringArg(args, "objective") ?? "OMO huge orchestration"]
  addOptionalFlags(cmd, args, [["name", "--name"], ["providers", "--providers"]])
  if (boolArg(args, "dryRun", true)) cmd.push("--dry-run")
  const result = await runLfgJson(context, cmd, 45_000, "ulw")
  result.note = "Hyperplan/OMO agent expansion handled by lfg team_create + TeamRuntime when spec contains hyperplan or template"
  return textResult(result)
}

async function omoUlw(args: JsonRecord, context: ToolContext): Promise<JsonRecord> {
  const action = stringArg(args, "action") ?? "create"
  if (action === "intent") return textResult({ ok: true, source: "lfg-native", message: stringArg(args, "message") ?? "", model: stringArg(args, "model") ?? "grok", note: "Intent preamble handling is provided by the lfg/ulw runtime, not an archived reference tree." })
  if (action === "hyperplan-sim") return textResult(await runLfgJson(context, ["team", "create", "hyperplan", stringArg(args, "objective") ?? "hyperplan simulation via lfg MCP", "--providers", "grok,subagent", "--dry-run"], 30_000, "ulw"))
  return ultraworkLike("ultrawork", args, context)
}

function stripKeys(record: JsonRecord, keys: string[]): JsonRecord {
  const clone: JsonRecord = { ...record }
  for (const key of keys) delete clone[key]
  return clone
}

async function exists(path: string): Promise<boolean> {
  try {
    return await Bun.file(path).exists()
  } catch {
    return false
  }
}

const HANDLERS: Record<string, ToolHandler> = {
  grok_build_catalog: catalog,
  grok_build_status: status,
  grok_build_runtime: runtime,
  grok_build_doctor: doctor,
  grok_build_hook_bridge: hookBridge,
  grok_build_backend_start: backendStart,
  grok_build_agents: agents,
  grok_build_spawn: spawn,
  grok_build_route: route,
  grok_build_provider: provider,
  grok_build_boulder: boulder,
  grok_build_atlas: atlas,
  grok_build_hyperplan: hyperplan,
  grok_build_team: team,
  grok_build_ultrawork: (args, context) => ultraworkLike("ultrawork", args, context),
  grok_build_ultragoal: (args, context) => ultraworkLike("ultragoal", args, context),
  grok_build_ralph: (args, context) => ultraworkLike("ralph", args, context),
  grok_build_worker: (args, context) => simpleActionTool("worker", args, context),
  grok_build_cleanup: (args, context) => simpleActionTool("ai-slop-cleaner", args, context),
  grok_build_autoresearch: (args, context) => simpleActionTool("autoresearch", args, context),
  grok_build_deep_interview: (args, context) => simpleActionTool("deep-interview", args, context),
  grok_build_design: (args, context) => simpleActionTool("design", args, context),
  grok_build_notifications: (args, context) => simpleActionTool("configure-notifications", args, context),
  grok_build_models: models,
  grok_build_auth: auth,
  grok_build_ask: (args, context) => simpleActionTool("ask", { action: "create", ...args }, context),
  grok_build_analyze: (args, context) => simpleActionTool("analyze", args, context),
  grok_build_code_review: (args, context) => simpleActionTool("code-review", args, context),
  grok_build_pipeline: (args, context) => simpleActionTool("pipeline", args, context),
  grok_build_autopilot: (args, context) => simpleActionTool("autopilot", args, context),
  grok_build_performance_goal: (args, context) => simpleActionTool("performance-goal", args, context),
  grok_build_visual_ralph: (args, context) => simpleActionTool("visual-ralph", args, context),
  grok_build_autoresearch_goal: (args, context) => simpleActionTool("autoresearch-goal", args, context),
  grok_build_setup: setup,
  grok_build_skill: (args, context) => simpleActionTool("skill", args, context),
  grok_build_hud: (args, context) => runLfgRawText(context, ["hud", ...(boolArg(args, "text") ? ["--text"] : [])], 30_000),
  grok_build_cancel: (args, context) => simpleActionTool("cancel", args, context),
  grok_build_ultraqa: (args, context) => simpleActionTool("ultraqa", args, context),
  grok_build_goal: (args, context) => simpleActionTool("goal", args, context),
  grok_build_ralplan: (args, context) => simpleActionTool("ralplan", args, context),
  grok_build_plan: plan,
  grok_build_wiki: (args, context) => simpleActionTool("wiki", args, context),
  grok_build_slash: (args, context) => runLfgRawText(context, ["slash", stringArg(args, "command") ?? "", ...(stringArg(args, "providers") ? ["--providers", stringArg(args, "providers") ?? ""] : []), ...(boolArg(args, "dryRun", true) ? ["--dry-run"] : [])], 30_000),
  grok_build_omo_agent_catalog: omoAgentCatalog,
  grok_build_omo_team_create: omoTeamCreate,
  grok_build_omo_ulw: omoUlw,
  grok_build_omo_doctor: (args, context) => doctor(args, context),
}
