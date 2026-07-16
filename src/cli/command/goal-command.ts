import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { buildAppServerTurnPrompt, planOmoHandoff } from "../../core/lfg/external-engine"
import { createCodexAppServerClient, type AppServerClient } from "../../core/lfg/orchestrator/app-server"
import { loadOrchestratorInbox, pollThreadResults, saveOrchestratorInbox } from "../../core/lfg/orchestrator/inbox"
import { registerHandoffInOrchestrator } from "../../core/lfg/orchestrator/register-handoff"
import { attachMonitorAfterHandoff } from "../../core/lfg/orchestrator/attach-monitor"
import { startNextUlwLoop, summarizeUlwLoopPlan } from "../../core/omo/ulw-loop/plan-crud"
import { readUlwLoopPlan } from "../../core/omo/ulw-loop/plan-io"
import { resolveUlwLoopSessionIdFromEnv, type UlwLoopScope } from "../../core/omo/ulw-loop/paths"
import type { UlwLoopItem } from "../../core/omo/ulw-loop/types"
import type { JsonObject } from "../../shared/json"

const DEFAULT_RESULT_PATH: string | null = null

function ulwScope(): UlwLoopScope | undefined {
  const sessionId = resolveUlwLoopSessionIdFromEnv()
  return sessionId === null ? undefined : { sessionId }
}

type GoalCommandOptions = {
  readonly json: boolean
  readonly appServerClient?: AppServerClient
}

type ParsedFlags = {
  readonly cwd: string
  readonly focus: string | null
  readonly askId: string | null
  readonly resultPath: string | null
  readonly skills: readonly string[]
  readonly payloadFile: string | null
}

export async function dispatchGoalCommand(argv: readonly string[], options: GoalCommandOptions): Promise<JsonObject> {
  if (!options.json) return invalidGoal(null, "goal commands require --json")
  const args = argv[0] === "goal" ? argv.slice(1) : argv
  const subcommand = args[0]
  if (subcommand === "board") return boardCommand(args.slice(1), options)
  if (subcommand === "drive") return driveCommand(args.slice(1), options)
  if (subcommand === "poll") return pollCommand(args.slice(1))
  return legacyPlanCommand(args, options)
}

async function boardCommand(argv: readonly string[], options: GoalCommandOptions): Promise<JsonObject> {
  const parsed = parseFlags(argv)
  if (typeof parsed === "string") return invalidGoal("board", parsed)
  try {
    const plan = await readUlwLoopPlan(parsed.cwd, ulwScope())
    const appServer = await (options.appServerClient ?? createCodexAppServerClient()).snapshot({ cwd: parsed.cwd, startDaemon: false })
    const currentGoal = plan.goals.find((goal) => goal.status === "in_progress") ?? null
    const nextGoal = plan.goals.find((goal) => goal.status === "pending") ?? null
    const activeThread = appServer.threads.find((thread) => thread.cwd === parsed.cwd && thread.status === "active") ?? null
    return {
      ok: true,
      status: "goal_board",
      command: "goal",
      subcommand: "board",
      projectRoot: parsed.cwd,
      board: {
        currentGoal: goalCard(currentGoal),
        nextGoal: goalCard(nextGoal),
        summary: summarizeUlwLoopPlan(plan),
        appServer: { availability: appServer.availability, activeThreadId: activeThread?.id ?? null },
      },
      lfgIsPlugin: false,
    }
  } catch (error) {
    return invalidGoal("board", cleanError(error))
  }
}

async function driveCommand(argv: readonly string[], options: GoalCommandOptions): Promise<JsonObject> {
  const parsed = parseFlags(argv)
  if (typeof parsed === "string") return invalidGoal("drive", parsed)
  try {
    const started = await startNextUlwLoop(parsed.cwd, { retryFailed: false }, ulwScope())
    if ("done" in started) {
      return { ok: true, status: "goal_board_complete", command: "goal", subcommand: "drive", done: true, lfgIsPlugin: false }
    }
    const requested = parsed.skills.length === 0 ? ["ulw-loop"] : parsed.skills
    const focus = `${requested.map((skill) => skill.trim()).filter(Boolean).join(" ")} ${parsed.focus ?? started.goal.objective}`.trim()
    const result = await handoffGoal({
      cwd: parsed.cwd,
      focus,
      resultPath: parsed.resultPath,
      payloadFile: parsed.payloadFile,
      askId: parsed.askId,
      goal: started.goal,
      appServerClient: options.appServerClient,
    })
    return {
      ...result,
      status: result.transport === "codex-exec-fallback" ? "goal_fallback_planned" : result.ok === true ? "goal_driven" : "goal_drive_failed",
      command: "goal",
      subcommand: "drive",
      goal: started.goal,
      skillRoute: { requested, embedded: result.handoff !== null },
    }
  } catch (error) {
    return invalidGoal("drive", cleanError(error))
  }
}

async function pollCommand(argv: readonly string[]): Promise<JsonObject> {
  const parsed = parseFlags(argv)
  if (typeof parsed === "string") return invalidGoal("poll", parsed)
  let inbox = await loadOrchestratorInbox(parsed.cwd)
  inbox = await pollThreadResults(parsed.cwd, inbox)
  await saveOrchestratorInbox(parsed.cwd, inbox)
  if (parsed.resultPath === null) {
    const running = inbox.threads.filter((t) => t.status === "planned" || t.status === "running")
    const ready = inbox.threads.filter((t) => t.status === "result_ready")
    return {
      ok: true,
      status: ready.length > 0 ? "goal_threads_ready" : running.length > 0 ? "goal_threads_running" : "goal_threads_idle",
      command: "goal",
      subcommand: "poll",
      passive: true,
      naturalMode: true,
      threads: { running: running.length, resultReady: ready.length, total: inbox.threads.length },
      note: "No --result-path: monitor Codex App / git diffs naturally; optional receipts only if you pass --result-path.",
      lfgIsPlugin: false,
    }
  }
  const result = await readResult(parsed.cwd, parsed.resultPath)
  return {
    ok: true,
    status: result === null ? "goal_result_pending" : "goal_result_ready",
    command: "goal",
    subcommand: "poll",
    passive: true,
    result: result ?? { path: parsed.resultPath, status: "pending" },
    lfgIsPlugin: false,
  }
}

async function legacyPlanCommand(argv: readonly string[], options: GoalCommandOptions): Promise<JsonObject> {
  const parsed = parseFlags(argv)
  if (typeof parsed === "string") return invalidGoal("goal", parsed)
  if (parsed.focus === null) return invalidGoal("goal", "goal requires --focus")
  return handoffGoal({ cwd: parsed.cwd, focus: parsed.focus, askId: parsed.askId, resultPath: parsed.resultPath, payloadFile: parsed.payloadFile, appServerClient: options.appServerClient })
}

async function handoffGoal(input: {
  readonly cwd: string
  readonly focus: string
  readonly askId?: string | null
  readonly resultPath: string | null
  readonly payloadFile?: string | null
  readonly goal?: UlwLoopItem
  readonly appServerClient?: AppServerClient
}): Promise<JsonObject> {
  const handoff = planOmoHandoff({
    role: "coding",
    engine: "gpt",
    focus: input.focus,
    deliverable: input.resultPath
      ? `Implement the goal in the project. Optional receipt at ${input.resultPath}.`
      : "Implement the goal in the project tree as a normal Codex coding session.",
    ...(input.resultPath ? { resultPath: input.resultPath } : {}),
    cwd: input.cwd,
    ...(input.payloadFile ? { payloadFile: input.payloadFile } : {}),
  })
  if ("error" in handoff) return invalidGoal("drive", handoff.error)
  const turn = await buildAppServerTurnPrompt({
    workerPrompt: handoff.workerPrompt,
    focus: handoff.focus,
    payloadFile: input.payloadFile ?? (handoff.launch.stdinSource?.kind === "file" ? handoff.launch.stdinSource.path : null),
    cwd: input.cwd,
  })
  const appServer = await (input.appServerClient ?? createCodexAppServerClient()).handoff({
    cwd: input.cwd,
    prompt: turn.prompt,
    threadName: `lfg/goal: ${shortFocus(input.focus)}`,
    goal: { objective: input.goal?.objective ?? turn.goalObjective, status: "active" },
  })
  const appServerThreadId = appServer.thread?.id ?? null
  let orchestrator: JsonObject
  try {
    const ledgerPath = input.resultPath ?? `codex-app:${appServerThreadId ?? "pending"}`
    const registered = await registerHandoffInOrchestrator(input.cwd, {
      engine: handoff.engine,
      binary: handoff.launch.binary,
      role: "coding",
      focus: handoff.focus,
      resultPath: ledgerPath,
      askId: input.askId,
      status: appServer.transport === "app-server" ? "running" : "planned",
      appServerThreadId,
      appServerSessionId: appServer.thread?.sessionId ?? null,
    })
    orchestrator = { registered: true, threadId: registered.thread.id, appServerThreadId, status: registered.thread.status, resultPath: input.resultPath }
  } catch {
    orchestrator = { registered: false, appServerThreadId, resultPath: input.resultPath }
  }
  // Handed off when app-server started a turn/thread; goalSynced only means thread/goal/set RPC succeeded.
  const executed =
    appServer.transport === "app-server" && appServer.thread !== null && appServer.turnId !== null
  const ok = executed || appServer.transport === "codex-exec-fallback"
  let monitor: JsonObject | null = null
  if (appServer.transport === "app-server") {
    try {
      const attached = await attachMonitorAfterHandoff(input.cwd, {
        appServerClient: input.appServerClient,
        follow: true,
      })
      monitor = {
        attached: true,
        boardPath: attached.boardPath,
        follow: attached.follow,
        summary: attached.board.summary,
        appServer: attached.board.appServer,
        threads: attached.board.threads.filter((t) => t.status === "running" || t.status === "planned"),
      }
    } catch (error) {
      monitor = {
        attached: false,
        error: error instanceof Error ? error.message.slice(0, 300) : "monitor attach failed",
      }
    }
  }
  return {
    ok,
    status: executed ? "goal_synced" : "goal_fallback_planned",
    command: "plan",
    subcommand: "goal",
    executed,
    transport: appServer.transport,
    threadId: appServerThreadId,
    goalSynced: appServer.goalSynced,
    turnId: appServer.turnId,
    resultPath: input.resultPath,
    handoff,
    orchestrator,
    monitor,
    ...(appServer.error === null ? {} : { fallbackReason: appServer.error }),
    lfgIsPlugin: false,
  }
}

function parseFlags(argv: readonly string[]): ParsedFlags | string {
  let cwd = process.cwd()
  let focus: string | null = null
  let askId: string | null = null
  let resultPath: string | null = DEFAULT_RESULT_PATH
  const skills: string[] = []
  let payloadFile: string | null = null
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index]
    const value = argv[index + 1]
    if (flag !== "--focus" && flag !== "--cwd" && flag !== "--ask-id" && flag !== "--result-path" && flag !== "--skill" && flag !== "--payload-file") return `Unknown goal flag: ${flag ?? ""}`
    if (typeof value !== "string" || value.length === 0 || value.startsWith("--")) return `${flag} requires a value`
    if (flag === "--focus") focus = value
    if (flag === "--cwd") cwd = value
    if (flag === "--ask-id") askId = value
    if (flag === "--result-path") resultPath = value
    if (flag === "--skill") skills.push(value)
    if (flag === "--payload-file") payloadFile = value
  }
  return { cwd, focus, askId, resultPath, skills, payloadFile }
}

function goalCard(goal: UlwLoopItem | null): JsonObject | null {
  return goal === null ? null : { id: goal.id, title: goal.title, status: goal.status, criteria: goal.successCriteria }
}

async function readResult(cwd: string, resultPath: string): Promise<JsonObject | null> {
  try {
    const body = await readFile(join(cwd, resultPath), "utf8")
    const match = body.match(/^STATUS:\s*(pass|fail|blocked)\s*$/im)
    return { path: resultPath, status: match?.[1]?.toLowerCase() ?? "unknown", body }
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null
    throw error
  }
}

function shortFocus(focus: string): string {
  return focus.replace(/\s+/g, " ").trim().slice(0, 72)
}

function cleanError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function invalidGoal(subcommand: string | null, error: string): JsonObject {
  return {
    ok: false,
    status: "invalid_goal_plan",
    command: "goal",
    subcommand,
    error,
    usage: "lfg --json goal board|drive|poll [--cwd PATH] [--skill NAME] [--result-path PATH] [--payload-file PATH]",
    lfgIsPlugin: false,
  }
}
