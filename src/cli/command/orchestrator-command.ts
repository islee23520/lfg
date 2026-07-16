import {
  loadOrchestratorInbox,
  markAskAnswered,
  pollThreadResults,
  recordUserAsk,
  registerCodexThread,
  saveOrchestratorInbox,
  summarizeInbox,
  type OrchestratorInbox,
} from "../../core/lfg/orchestrator/inbox"
import type { JsonObject } from "../../shared/json"
import { createCodexAppServerClient, syncAppServerSnapshot, type AppServerClient } from "../../core/lfg/orchestrator/app-server"
import { buildMonitorBoard } from "../../core/lfg/orchestrator/attach-monitor"
import { mkdir, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"

type Options = {
  readonly json: boolean
  readonly env: Readonly<Record<string, string | undefined>>
  readonly appServerClient?: AppServerClient
}

export async function dispatchOrchestratorCommand(
  argv: readonly string[],
  options: Options,
): Promise<JsonObject> {
  if (!options.json) {
    return fail(null, "orchestrator requires --json")
  }
  const [sub, ...rest] = argv
  if (sub === undefined || sub === "status") {
    return statusCommand(rest, options)
  }
  if (sub === "ask") return askCommand(rest, options)
  if (sub === "thread") return threadCommand(rest, options)
  if (sub === "poll") return pollCommand(rest, options)
  if (sub === "answer") return answerCommand(rest, options)
  if (sub === "watch" || sub === "sync-app-server") return watchCommand(rest, options, sub)
  if (sub === "threads") return threadsCommand(rest, options)
  return fail(sub, `Unsupported orchestrator subcommand: ${sub}`)
}

async function watchCommand(
  argv: readonly string[],
  options: Options,
  subcommand: "watch" | "sync-app-server",
): Promise<JsonObject> {
  const projectRoot = cwdFrom(argv, options.env)
  const follow = argv.includes("--follow")
  const client = options.appServerClient ?? createCodexAppServerClient({ env: options.env })
  const once = async () => {
    const snapshot = await client.snapshot({ cwd: projectRoot, startDaemon: !argv.includes("--no-start-daemon") })
    let inbox = await loadOrchestratorInbox(projectRoot)
    const synced = syncAppServerSnapshot(projectRoot, inbox, snapshot)
    inbox = await pollThreadResults(projectRoot, synced.inbox)
    const path = await saveOrchestratorInbox(projectRoot, inbox)
    try {
      const board = buildMonitorBoard(projectRoot, inbox, snapshot.availability, { spawned: follow, pid: null })
      const boardPath = join(projectRoot, ".omo", "orchestrator", "monitor-board.json")
      await mkdir(dirname(boardPath), { recursive: true })
      await writeFile(boardPath, `${JSON.stringify(board, null, 2)}\n`, "utf8")
    } catch {
      // board write is best-effort
    }
    return {
      ok: snapshot.availability === "available",
      status: snapshot.availability === "available" ? "orchestrator_app_server_synced" : "orchestrator_app_server_missing",
      command: "orchestrator",
      subcommand,
      projectRoot,
      path,
      appServer: snapshot,
      sync: synced.summary,
      inbox,
      summary: summaryJson(summarizeInbox(projectRoot, inbox)),
      fallback: snapshot.availability === "missing" ? "RESULT file polling remains available via orchestrator poll" : null,
      follow,
      lfgIsPlugin: false,
    } as const
  }

  if (!follow) return { ...(await once()) }

  // Follow until no planned/running threads (or max ticks).
  const maxTicks = Number.parseInt(options.env.LFG_MONITOR_FOLLOW_TICKS ?? "120", 10) || 120
  const intervalMs = Number.parseInt(options.env.LFG_MONITOR_FOLLOW_MS ?? "3000", 10) || 3000
  let last = await once()
  for (let tick = 1; tick < maxTicks; tick += 1) {
    const running = (last.inbox as { threads?: readonly { status?: string }[] }).threads?.filter(
      (t) => t.status === "planned" || t.status === "running",
    ).length ?? 0
    if (running === 0) break
    await new Promise((r) => setTimeout(r, intervalMs))
    last = await once()
  }
  return { ...last, followComplete: true }
}

async function threadsCommand(argv: readonly string[], options: Options): Promise<JsonObject> {
  const projectRoot = cwdFrom(argv, options.env)
  const client = options.appServerClient ?? createCodexAppServerClient({ env: options.env })
  const snapshot = await client.snapshot({ cwd: projectRoot, startDaemon: false })
  const inbox = await loadOrchestratorInbox(projectRoot)
  return {
    ok: true,
    status: "orchestrator_threads",
    command: "orchestrator",
    subcommand: "threads",
    projectRoot,
    appServer: snapshot,
    ledgerThreads: inbox.threads,
    lfgIsPlugin: false,
  }
}

async function statusCommand(argv: readonly string[], options: Options): Promise<JsonObject> {
  const projectRoot = cwdFrom(argv, options.env)
  let inbox = await loadOrchestratorInbox(projectRoot)
  inbox = await pollThreadResults(projectRoot, inbox)
  await saveOrchestratorInbox(projectRoot, inbox)
  const summary = summarizeInbox(projectRoot, inbox)
  return {
    ok: true,
    status: "orchestrator_status",
    command: "orchestrator",
    subcommand: "status",
    projectRoot,
    inbox,
    summary: summaryJson(summary),
    hookContext: summary.lines.join("\n"),
    lfgIsPlugin: false,
  }
}

async function askCommand(argv: readonly string[], options: Options): Promise<JsonObject> {
  const flags = parseFlags(argv)
  const text = flags.text
  if (!text) return fail("ask", "ask requires --text")
  const projectRoot = flags.cwd ?? process.cwd()
  let inbox = await loadOrchestratorInbox(projectRoot)
  const recorded = recordUserAsk(inbox, text)
  inbox = recorded.inbox
  const path = await saveOrchestratorInbox(projectRoot, inbox)
  return {
    ok: true,
    status: "orchestrator_ask_recorded",
    command: "orchestrator",
    subcommand: "ask",
    projectRoot,
    path,
    ask: recorded.ask,
    lfgIsPlugin: false,
  }
}

async function threadCommand(argv: readonly string[], options: Options): Promise<JsonObject> {
  const [action, ...rest] = argv
  if (action !== "register") {
    return fail("thread", `Unsupported orchestrator thread action: ${action ?? ""}`)
  }
  const flags = parseFlags(rest)
  if (!flags.resultPath) return fail("thread", "thread register requires --result-path")
  const projectRoot = flags.cwd ?? process.cwd()
  let inbox = await loadOrchestratorInbox(projectRoot)
  const reg = registerCodexThread(inbox, {
    engine: flags.engine ?? "gpt",
    binary: flags.binary ?? "codex",
    role: flags.role ?? "coding",
    focus: flags.focus ?? "",
    resultPath: flags.resultPath,
    askId: flags.askId ?? null,
    sessionHint: flags.sessionHint ?? null,
    status: (flags.status as "planned" | "running" | undefined) ?? "planned",
  })
  inbox = reg.inbox
  const path = await saveOrchestratorInbox(projectRoot, inbox)
  return {
    ok: true,
    status: "orchestrator_thread_registered",
    command: "orchestrator",
    subcommand: "thread",
    action: "register",
    projectRoot,
    path,
    thread: reg.thread,
    lfgIsPlugin: false,
  }
}

async function pollCommand(argv: readonly string[], options: Options): Promise<JsonObject> {
  const projectRoot = cwdFrom(argv, options.env)
  let inbox = await loadOrchestratorInbox(projectRoot)
  inbox = await pollThreadResults(projectRoot, inbox)
  const path = await saveOrchestratorInbox(projectRoot, inbox)
  const summary = summarizeInbox(projectRoot, inbox)
  return {
    ok: true,
    status: "orchestrator_polled",
    command: "orchestrator",
    subcommand: "poll",
    projectRoot,
    path,
    inbox,
    summary: summaryJson(summary),
    lfgIsPlugin: false,
  }
}

async function answerCommand(argv: readonly string[], options: Options): Promise<JsonObject> {
  const flags = parseFlags(argv)
  if (!flags.askId) return fail("answer", "answer requires --ask-id")
  if (!flags.summary) return fail("answer", "answer requires --summary")
  const projectRoot = flags.cwd ?? process.cwd()
  let inbox = await loadOrchestratorInbox(projectRoot)
  inbox = markAskAnswered(inbox, flags.askId, flags.summary)
  const path = await saveOrchestratorInbox(projectRoot, inbox)
  return {
    ok: true,
    status: "orchestrator_ask_answered",
    command: "orchestrator",
    subcommand: "answer",
    projectRoot,
    path,
    askId: flags.askId,
    lfgIsPlugin: false,
  }
}

function summaryJson(summary: ReturnType<typeof summarizeInbox>): JsonObject {
  return {
    path: summary.path,
    openAsks: summary.openAsks,
    inProgressAsks: summary.inProgressAsks,
    unansweredAsks: summary.unansweredAsks,
    runningThreads: summary.runningThreads,
    resultReadyThreads: summary.resultReadyThreads,
    failedThreads: summary.failedThreads,
    needsUserReply: summary.needsUserReply,
  }
}

function cwdFrom(argv: readonly string[], env: Readonly<Record<string, string | undefined>>): string {
  const flags = parseFlags(argv)
  return flags.cwd ?? env.PWD ?? process.cwd()
}

function parseFlags(argv: readonly string[]): {
  readonly text?: string
  readonly cwd?: string
  readonly resultPath?: string
  readonly engine?: string
  readonly binary?: string
  readonly role?: string
  readonly focus?: string
  readonly askId?: string
  readonly sessionHint?: string
  readonly status?: string
  readonly summary?: string
} {
  let text: string | undefined
  let cwd: string | undefined
  let resultPath: string | undefined
  let engine: string | undefined
  let binary: string | undefined
  let role: string | undefined
  let focus: string | undefined
  let askId: string | undefined
  let sessionHint: string | undefined
  let status: string | undefined
  let summary: string | undefined
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!
    const next = argv[i + 1]
    const take = (): string | undefined => {
      if (typeof next !== "string") return undefined
      i += 1
      return next
    }
    if (arg === "--text") text = take()
    else if (arg === "--cwd") cwd = take()
    else if (arg === "--result-path") resultPath = take()
    else if (arg === "--engine") engine = take()
    else if (arg === "--binary") binary = take()
    else if (arg === "--role") role = take()
    else if (arg === "--focus") focus = take()
    else if (arg === "--ask-id") askId = take()
    else if (arg === "--session-hint") sessionHint = take()
    else if (arg === "--status") status = take()
    else if (arg === "--summary") summary = take()
  }
  return { text, cwd, resultPath, engine, binary, role, focus, askId, sessionHint, status, summary }
}

function fail(subcommand: string | null, error: string): JsonObject {
  return {
    ok: false,
    status: "invalid_orchestrator",
    command: "orchestrator",
    subcommand,
    error,
    usage: [
      "lfg --json orchestrator status [--cwd PATH]",
      "lfg --json orchestrator ask --text \"user request\"",
      "lfg --json orchestrator thread register --result-path PATH --role coding --focus TEXT [--ask-id ID]",
      "lfg --json orchestrator poll",
      "lfg --json orchestrator watch|sync-app-server [--cwd PATH]",
      "lfg --json orchestrator threads [--cwd PATH]",
      "lfg --json orchestrator watch [--cwd PATH]",
      "lfg --json orchestrator sync-app-server [--cwd PATH]",
      "lfg --json orchestrator threads [--cwd PATH]",
      "lfg --json orchestrator answer --ask-id ID --summary \"what user was told\"",
    ].join("\n"),
    lfgIsPlugin: false,
  }
}

// silence unused type import if tree-shaken
export type { OrchestratorInbox }
