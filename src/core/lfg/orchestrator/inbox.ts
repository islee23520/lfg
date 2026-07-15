/**
 * Durable CEO inbox under .omo/orchestrator/
 * Tracks user asks, multi-Codex threads, RESULT readiness, and whether Grok answered the user.
 */
import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { createHash, randomUUID } from "node:crypto"

export const ORCHESTRATOR_INBOX_VERSION = 1 as const
export const ORCHESTRATOR_DIR = join(".omo", "orchestrator")
export const ORCHESTRATOR_INBOX_FILE = "inbox.json"

export type AskStatus = "open" | "in_progress" | "answered" | "blocked"
export type ThreadStatus = "planned" | "running" | "result_ready" | "stale" | "failed"

export type OrchestratorAsk = {
  readonly id: string
  readonly userText: string
  readonly createdAt: string
  readonly updatedAt: string
  readonly status: AskStatus
  readonly userAnsweredAt: string | null
  readonly answerSummary: string | null
  readonly threadIds: readonly string[]
}

export type OrchestratorThread = {
  readonly id: string
  readonly engine: string
  readonly binary: string
  readonly role: string
  readonly focus: string
  readonly resultPath: string
  readonly status: ThreadStatus
  readonly askIds: readonly string[]
  readonly createdAt: string
  readonly updatedAt: string
  readonly resultStatus: string | null
  readonly resultSnippet: string | null
  readonly sessionHint: string | null
  readonly appServerThreadId: string | null
  readonly appServerSessionId: string | null
  readonly appServerStatus: string | null
  readonly appServerLastSeenAt: string | null
}

export type OrchestratorInbox = {
  readonly version: typeof ORCHESTRATOR_INBOX_VERSION
  readonly updatedAt: string
  readonly asks: readonly OrchestratorAsk[]
  readonly threads: readonly OrchestratorThread[]
}

export type InboxSummary = {
  readonly path: string
  readonly openAsks: number
  readonly inProgressAsks: number
  readonly unansweredAsks: number
  readonly runningThreads: number
  readonly resultReadyThreads: number
  readonly failedThreads: number
  readonly needsUserReply: boolean
  readonly lines: readonly string[]
}

export function emptyInbox(now = new Date().toISOString()): OrchestratorInbox {
  return { version: ORCHESTRATOR_INBOX_VERSION, updatedAt: now, asks: [], threads: [] }
}

export function orchestratorInboxPath(projectRoot: string): string {
  return join(projectRoot, ORCHESTRATOR_DIR, ORCHESTRATOR_INBOX_FILE)
}

export async function loadOrchestratorInbox(projectRoot: string): Promise<OrchestratorInbox> {
  const path = orchestratorInboxPath(projectRoot)
  try {
    const raw = await readFile(path, "utf8")
    const parsed = JSON.parse(raw) as unknown
    return normalizeInbox(parsed)
  } catch (error) {
    if (isEnoent(error)) return emptyInbox()
    // Fail closed to empty rather than crash hooks.
    return emptyInbox()
  }
}

export async function saveOrchestratorInbox(projectRoot: string, inbox: OrchestratorInbox): Promise<string> {
  const path = orchestratorInboxPath(projectRoot)
  await mkdir(dirname(path), { recursive: true })
  const next: OrchestratorInbox = { ...inbox, updatedAt: new Date().toISOString() }
  const tmp = `${path}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`
  await writeFile(tmp, `${JSON.stringify(next, null, 2)}\n`, "utf8")
  await rename(tmp, path)
  return path
}

export function recordUserAsk(
  inbox: OrchestratorInbox,
  userText: string,
  now = new Date().toISOString(),
): { readonly inbox: OrchestratorInbox; readonly ask: OrchestratorAsk } {
  const text = userText.trim()
  const ask: OrchestratorAsk = {
    id: `ask-${shortId(text + now)}`,
    userText: text.slice(0, 2000),
    createdAt: now,
    updatedAt: now,
    status: "open",
    userAnsweredAt: null,
    answerSummary: null,
    threadIds: [],
  }
  return { inbox: { ...inbox, asks: [ask, ...inbox.asks].slice(0, 200), updatedAt: now }, ask }
}

export function registerCodexThread(
  inbox: OrchestratorInbox,
  input: {
    readonly engine: string
    readonly binary: string
    readonly role: string
    readonly focus: string
    readonly resultPath: string
    readonly askId?: string | null
    readonly sessionHint?: string | null
    readonly appServerThreadId?: string | null
    readonly appServerSessionId?: string | null
    readonly status?: ThreadStatus
  },
  now = new Date().toISOString(),
): { readonly inbox: OrchestratorInbox; readonly thread: OrchestratorThread } {
  const resultPath = input.resultPath.trim()
  const existing = inbox.threads.find((t) => t.resultPath === resultPath)
  const askId = input.askId?.trim() || null
  if (existing) {
    const askIds = askId && !existing.askIds.includes(askId) ? [...existing.askIds, askId] : existing.askIds
    const thread: OrchestratorThread = {
      ...existing,
      engine: input.engine,
      binary: input.binary,
      role: input.role,
      focus: input.focus.slice(0, 500),
      status: input.status ?? existing.status,
      askIds,
      updatedAt: now,
      sessionHint: input.sessionHint ?? existing.sessionHint,
      appServerThreadId: input.appServerThreadId ?? existing.appServerThreadId,
      appServerSessionId: input.appServerSessionId ?? existing.appServerSessionId,
    }
    let asks = inbox.asks
    if (askId) {
      asks = inbox.asks.map((a) =>
        a.id === askId
          ? {
              ...a,
              status: a.status === "answered" ? a.status : "in_progress",
              updatedAt: now,
              threadIds: a.threadIds.includes(thread.id) ? a.threadIds : [...a.threadIds, thread.id],
            }
          : a,
      )
    }
    return {
      inbox: {
        ...inbox,
        threads: inbox.threads.map((t) => (t.id === thread.id ? thread : t)),
        asks,
        updatedAt: now,
      },
      thread,
    }
  }

  const thread: OrchestratorThread = {
    id: `thr-${shortId(resultPath + now)}`,
    engine: input.engine,
    binary: input.binary,
    role: input.role,
    focus: input.focus.slice(0, 500),
    resultPath,
    status: input.status ?? "planned",
    askIds: askId ? [askId] : [],
    createdAt: now,
    updatedAt: now,
    resultStatus: null,
    resultSnippet: null,
    sessionHint: input.sessionHint ?? null,
    appServerThreadId: input.appServerThreadId ?? null,
    appServerSessionId: input.appServerSessionId ?? null,
    appServerStatus: null,
    appServerLastSeenAt: null,
  }
  let asks = inbox.asks
  if (askId) {
    asks = inbox.asks.map((a) =>
      a.id === askId
        ? {
            ...a,
            status: a.status === "answered" ? a.status : "in_progress",
            updatedAt: now,
            threadIds: a.threadIds.includes(thread.id) ? a.threadIds : [...a.threadIds, thread.id],
          }
        : a,
    )
  }
  return {
    inbox: {
      ...inbox,
      threads: [thread, ...inbox.threads].slice(0, 200),
      asks,
      updatedAt: now,
    },
    thread,
  }
}

export function markAskAnswered(
  inbox: OrchestratorInbox,
  askId: string,
  answerSummary: string,
  now = new Date().toISOString(),
): OrchestratorInbox {
  return {
    ...inbox,
    updatedAt: now,
    asks: inbox.asks.map((a) =>
      a.id === askId
        ? {
            ...a,
            status: "answered",
            userAnsweredAt: now,
            answerSummary: answerSummary.trim().slice(0, 2000),
            updatedAt: now,
          }
        : a,
    ),
  }
}

export async function pollThreadResults(
  projectRoot: string,
  inbox: OrchestratorInbox,
  now = new Date().toISOString(),
): Promise<OrchestratorInbox> {
  const threads: OrchestratorThread[] = []
  for (const thread of inbox.threads) {
    const abs = resolve(projectRoot, thread.resultPath)
    const polled = await pollOneResult(abs)
    if (polled === null) {
      threads.push(thread.status === "planned" || thread.status === "running" ? thread : { ...thread, status: thread.status })
      continue
    }
    threads.push({
      ...thread,
      status: polled.failed ? "failed" : "result_ready",
      resultStatus: polled.status,
      resultSnippet: polled.snippet,
      updatedAt: now,
    })
  }

  // Lift ask status when all linked threads have results.
  const asks: OrchestratorAsk[] = inbox.asks.map((ask): OrchestratorAsk => {
    if (ask.status === "answered" || ask.threadIds.length === 0) return ask
    const linked = threads.filter((t) => ask.threadIds.includes(t.id))
    if (linked.length === 0) return ask
    const anyFailed = linked.some((t) => t.status === "failed")
    const allReady = linked.every((t) => t.status === "result_ready" || t.status === "failed")
    if (allReady) {
      return {
        ...ask,
        status: anyFailed ? "blocked" : "in_progress", // still need CEO to answer user
        updatedAt: now,
      }
    }
    if (linked.some((t) => t.status === "running" || t.status === "planned" || t.status === "result_ready")) {
      return { ...ask, status: "in_progress", updatedAt: now }
    }
    return ask
  })

  return { ...inbox, threads, asks, updatedAt: now }
}

export function summarizeInbox(projectRoot: string, inbox: OrchestratorInbox): InboxSummary {
  const openAsks = inbox.asks.filter((a) => a.status === "open").length
  const inProgressAsks = inbox.asks.filter((a) => a.status === "in_progress").length
  const unansweredAsks = inbox.asks.filter((a) => a.status !== "answered").length
  const runningThreads = inbox.threads.filter((t) => t.status === "planned" || t.status === "running").length
  const resultReadyThreads = inbox.threads.filter((t) => t.status === "result_ready").length
  const failedThreads = inbox.threads.filter((t) => t.status === "failed").length
  const needsUserReply =
    unansweredAsks > 0 &&
    (resultReadyThreads > 0 || failedThreads > 0 || inProgressAsks > 0 || openAsks > 0)

  const lines: string[] = [
    "<lfg-always-on-monitors>",
    "ALWAYS keep MULTIPLE monitors open (CEO). Do not single-glance and forget.",
    "M1 inbox-asks | M2 result-files | M3 codex-app-server | M4 residual-stack | M5 user-answer-receipt",
    `now: unanswered=${unansweredAsks} running=${runningThreads} ready=${resultReadyThreads} failed=${failedThreads}`,
    "M3 command: `lfg --json orchestrator watch`; inspect app-server list/status before RESULT fallback.",
    "Re-check all lanes before any user-facing reply; aggregate parallel Codex threads.",
    "</lfg-always-on-monitors>",
    `<lfg-orchestrator-inbox path="${ORCHESTRATOR_DIR}/${ORCHESTRATOR_INBOX_FILE}">`,
    "CEO dashboard: multi-Codex threads + user-ask ledger (durable under .omo).",
    `open_asks=${openAsks} in_progress_asks=${inProgressAsks} unanswered_asks=${unansweredAsks}`,
    `running_threads=${runningThreads} result_ready=${resultReadyThreads} failed_threads=${failedThreads}`,
    `needs_user_reply=${needsUserReply ? "yes" : "no"}`,
  ]

  for (const ask of inbox.asks.filter((a) => a.status !== "answered").slice(0, 8)) {
    lines.push(
      `ASK ${ask.id} status=${ask.status} threads=${ask.threadIds.length} text=${jsonClip(ask.userText, 120)}`,
    )
  }
  for (const thr of inbox.threads.slice(0, 10)) {
    lines.push(
      `THR ${thr.id} status=${thr.status} engine=${thr.engine} role=${thr.role} result=${thr.resultPath}` +
        (thr.appServerStatus ? ` APP_SERVER=${thr.appServerStatus}` : "") +
        (thr.resultStatus ? ` RESULT=${thr.resultStatus}` : ""),
    )
    if (thr.resultSnippet) lines.push(`  snippet: ${jsonClip(thr.resultSnippet, 160)}`)
  }

  lines.push("RULES:")
  lines.push("- Do not invent pass/fail; poll RESULT files and update this ledger.")
  lines.push("- Before answering the user: check unanswered asks; aggregate thread RESULT evidence.")
  lines.push("- After answering: mark ask answered in the ledger (lfg orchestrator answer).")
  lines.push("- Parallel Codex threads are normal; watch all, then synthesize one CEO reply.")
  lines.push("- Prefer `lfg --json orchestrator watch` before user replies; this is a local Codex app-server control plane, not native Grok codex_app tooling.")
  lines.push("</lfg-orchestrator-inbox>")

  return {
    path: orchestratorInboxPath(projectRoot),
    openAsks,
    inProgressAsks,
    unansweredAsks,
    runningThreads,
    resultReadyThreads,
    failedThreads,
    needsUserReply,
    lines,
  }
}

export function renderInboxHookContext(summary: InboxSummary): string {
  return summary.lines.join("\n")
}

function normalizeInbox(value: unknown): OrchestratorInbox {
  if (!isRecord(value) || value.version !== ORCHESTRATOR_INBOX_VERSION) return emptyInbox()
  const asks = Array.isArray(value.asks) ? value.asks.filter(isAsk).map(normalizeAsk) : []
  const threads = Array.isArray(value.threads) ? value.threads.filter(isThread).map(normalizeThread) : []
  return {
    version: ORCHESTRATOR_INBOX_VERSION,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : new Date().toISOString(),
    asks,
    threads,
  }
}

function normalizeAsk(value: Record<string, unknown>): OrchestratorAsk {
  return {
    id: String(value.id),
    userText: String(value.userText ?? ""),
    createdAt: String(value.createdAt ?? ""),
    updatedAt: String(value.updatedAt ?? ""),
    status: (value.status as AskStatus) ?? "open",
    userAnsweredAt: typeof value.userAnsweredAt === "string" ? value.userAnsweredAt : null,
    answerSummary: typeof value.answerSummary === "string" ? value.answerSummary : null,
    threadIds: Array.isArray(value.threadIds) ? value.threadIds.map(String) : [],
  }
}

function normalizeThread(value: Record<string, unknown>): OrchestratorThread {
  return {
    id: String(value.id),
    engine: String(value.engine ?? "gpt"),
    binary: String(value.binary ?? "codex"),
    role: String(value.role ?? "coding"),
    focus: String(value.focus ?? ""),
    resultPath: String(value.resultPath ?? ""),
    status: (value.status as ThreadStatus) ?? "planned",
    askIds: Array.isArray(value.askIds) ? value.askIds.map(String) : [],
    createdAt: String(value.createdAt ?? ""),
    updatedAt: String(value.updatedAt ?? ""),
    resultStatus: typeof value.resultStatus === "string" ? value.resultStatus : null,
    resultSnippet: typeof value.resultSnippet === "string" ? value.resultSnippet : null,
    sessionHint: typeof value.sessionHint === "string" ? value.sessionHint : null,
    appServerThreadId: typeof value.appServerThreadId === "string" ? value.appServerThreadId : null,
    appServerSessionId: typeof value.appServerSessionId === "string" ? value.appServerSessionId : null,
    appServerStatus: typeof value.appServerStatus === "string" ? value.appServerStatus : null,
    appServerLastSeenAt: typeof value.appServerLastSeenAt === "string" ? value.appServerLastSeenAt : null,
  }
}

function isAsk(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && typeof value.id === "string"
}

function isThread(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && typeof value.id === "string" && typeof value.resultPath === "string"
}

async function pollOneResult(
  absPath: string,
): Promise<{ readonly status: string; readonly snippet: string; readonly failed: boolean } | null> {
  try {
    await access(absPath)
    const text = await readFile(absPath, "utf8")
    if (text.trim().length === 0) return null
    const statusMatch = /STATUS:\s*([^\n\r]+)/i.exec(text)
    const status = (statusMatch?.[1] ?? "present").trim()
    const failed = /\bfail\b/i.test(status) || /\berror\b/i.test(status)
    const snippet = text.replace(/\s+/g, " ").trim().slice(0, 240)
    return { status, snippet, failed }
  } catch {
    return null
  }
}

function shortId(seed: string): string {
  return createHash("sha1").update(seed).digest("hex").slice(0, 10)
}

function jsonClip(text: string, max: number): string {
  const one = text.replace(/\s+/g, " ").trim()
  return one.length <= max ? one : `${one.slice(0, max - 1)}…`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isEnoent(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "ENOENT"
}
