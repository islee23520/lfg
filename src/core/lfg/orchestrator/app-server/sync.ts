import { basename, resolve } from "node:path"
import type { OrchestratorInbox, OrchestratorThread, ThreadStatus } from "../inbox"
import type { AppServerSnapshot, AppServerThread } from "./types"

export type AppServerSyncSummary = {
  readonly matched: number
  readonly running: number
  readonly liveThreads: number
  readonly availability: AppServerSnapshot["availability"]
}

export function syncAppServerSnapshot(
  projectRoot: string,
  inbox: OrchestratorInbox,
  snapshot: AppServerSnapshot,
  now = new Date().toISOString(),
): { readonly inbox: OrchestratorInbox; readonly summary: AppServerSyncSummary } {
  let matched = 0
  const threads = inbox.threads.map((thread) => {
    const live = findLiveThread(projectRoot, thread, snapshot.threads)
    if (!live) return thread
    matched += 1
    return {
      ...thread,
      status: mapStatus(live.status, thread.status),
      appServerThreadId: live.id,
      appServerSessionId: live.sessionId,
      appServerStatus: live.status,
      appServerLastSeenAt: now,
      sessionHint: thread.sessionHint ?? live.sessionId ?? live.id,
      updatedAt: now,
    }
  })
  return {
    inbox: { ...inbox, threads, updatedAt: now },
    summary: {
      matched,
      running: threads.filter((thread) => thread.appServerStatus === "active").length,
      liveThreads: snapshot.threads.length,
      availability: snapshot.availability,
    },
  }
}

function findLiveThread(
  projectRoot: string,
  ledger: OrchestratorThread,
  liveThreads: readonly AppServerThread[],
): AppServerThread | undefined {
  const hints = [ledger.appServerThreadId, ledger.appServerSessionId, ledger.sessionHint].filter(Boolean)
  const exact = liveThreads.find((live) => hints.includes(live.id) || (live.sessionId !== null && hints.includes(live.sessionId)))
  if (exact) return exact
  const resultName = basename(resolve(projectRoot, ledger.resultPath)).toLowerCase()
  const focus = ledger.focus.trim().toLowerCase()
  return liveThreads.find((live) => {
    const text = `${live.name ?? ""}\n${live.preview ?? ""}`.toLowerCase()
    return (focus.length >= 12 && text.includes(focus.slice(0, 80))) || (resultName.length >= 8 && text.includes(resultName))
  })
}

function mapStatus(live: AppServerThread["status"], current: ThreadStatus): ThreadStatus {
  if (current === "result_ready" || current === "failed") return current
  if (live === "active") return "running"
  if (live === "systemError") return "failed"
  if (live === "idle" || live === "notLoaded") return "stale"
  return current
}
