/**
 * After Codex App handoff, attach monitoring immediately:
 * 1) sync app-server snapshot into inbox
 * 2) write .omo/orchestrator/monitor-board.json
 * 3) optionally spawn a detached follow loop (watch --follow)
 */

import { constants } from "node:fs"
import { access, mkdir, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import { findExecutableInPath } from "../../../shared/executable-path"
import {
  loadOrchestratorInbox,
  pollThreadResults,
  saveOrchestratorInbox,
  summarizeInbox,
  type OrchestratorInbox,
} from "./inbox"
import { createCodexAppServerClient, syncAppServerSnapshot, type AppServerClient } from "./app-server"

export type MonitorBoard = {
  readonly version: 1
  readonly updatedAt: string
  readonly projectRoot: string
  readonly attached: boolean
  readonly appServer: {
    readonly availability: string
    readonly activeThreadIds: readonly string[]
  }
  readonly summary: ReturnType<typeof summarizeInbox>
  readonly threads: readonly {
    readonly id: string
    readonly status: string
    readonly focus: string
    readonly appServerThreadId: string | null
    readonly appServerStatus: string | null
    readonly resultPath: string
  }[]
  readonly follow: { readonly spawned: boolean; readonly pid: number | null }
}

export type AttachMonitorResult = {
  readonly board: MonitorBoard
  readonly boardPath: string
  readonly inbox: OrchestratorInbox
  readonly follow: { readonly spawned: boolean; readonly pid: number | null }
}

export async function attachMonitorAfterHandoff(
  projectRoot: string,
  options: {
    readonly env?: Readonly<Record<string, string | undefined>>
    readonly appServerClient?: AppServerClient
    readonly follow?: boolean
    readonly lfgArgv0?: string
  } = {},
): Promise<AttachMonitorResult> {
  const env = options.env ?? process.env
  const client = options.appServerClient ?? createCodexAppServerClient({ env })
  const snapshot = await client.snapshot({ cwd: projectRoot, startDaemon: true })
  let inbox = await loadOrchestratorInbox(projectRoot)
  const synced = syncAppServerSnapshot(projectRoot, inbox, snapshot)
  inbox = await pollThreadResults(projectRoot, synced.inbox)
  await saveOrchestratorInbox(projectRoot, inbox)

  const follow =
    options.follow === false || env.LFG_MONITOR_FOLLOW === "0"
      ? { spawned: false, pid: null as number | null }
      : await spawnFollowWatcher(projectRoot, env, options.lfgArgv0)

  const board = buildMonitorBoard(projectRoot, inbox, snapshot.availability, follow)
  const boardPath = join(projectRoot, ".omo", "orchestrator", "monitor-board.json")
  await mkdir(dirname(boardPath), { recursive: true })
  await writeFile(boardPath, `${JSON.stringify(board, null, 2)}\n`, "utf8")

  return { board, boardPath, inbox, follow }
}

export function buildMonitorBoard(
  projectRoot: string,
  inbox: OrchestratorInbox,
  availability: string,
  follow: { readonly spawned: boolean; readonly pid: number | null },
): MonitorBoard {
  const now = new Date().toISOString()
  const activeThreadIds = inbox.threads
    .map((t) => t.appServerThreadId)
    .filter((id): id is string => typeof id === "string" && id.length > 0)
  return {
    version: 1,
    updatedAt: now,
    projectRoot,
    attached: true,
    appServer: { availability, activeThreadIds },
    summary: summarizeInbox(projectRoot, inbox),
    threads: inbox.threads.map((t) => ({
      id: t.id,
      status: t.status,
      focus: t.focus,
      appServerThreadId: t.appServerThreadId ?? null,
      appServerStatus: t.appServerStatus ?? null,
      resultPath: t.resultPath,
    })),
    follow,
  }
}

async function spawnFollowWatcher(
  projectRoot: string,
  env: Readonly<Record<string, string | undefined>>,
  lfgArgv0?: string,
): Promise<{ spawned: boolean; pid: number | null }> {
  try {
    const launch = await resolveLfgLaunch(env, lfgArgv0)
    if (launch === null) return { spawned: false, pid: null }
    const child = spawn(launch.command, [...launch.prefix, "--json", "orchestrator", "watch", "--follow", "--cwd", projectRoot], {
      cwd: projectRoot,
      env: { ...env, LFG_MONITOR_FOLLOW: "0" }, // prevent nested follow
      detached: true,
      stdio: "ignore",
    })
    child.unref()
    return { spawned: true, pid: child.pid ?? null }
  } catch {
    return { spawned: false, pid: null }
  }
}

async function resolveLfgLaunch(
  env: Readonly<Record<string, string | undefined>>,
  lfgArgv0?: string,
): Promise<{ readonly command: string; readonly prefix: readonly string[] } | null> {
  for (const candidate of [env.LFG_BIN?.trim(), env.LFG_CLI_BINARY?.trim(), lfgArgv0]) {
    if (!candidate) continue
    if (candidate.endsWith(".js") || candidate.endsWith(".mjs")) {
      try {
        await access(candidate, constants.R_OK)
        return { command: process.execPath, prefix: [candidate] }
      } catch {
        continue
      }
    }
    const executable = await findExecutableInPath(candidate, env)
    if (executable !== null) return { command: executable, prefix: [] }
  }
  const pathExecutable = await findExecutableInPath("lfg", env)
  if (pathExecutable !== null) return { command: pathExecutable, prefix: [] }
  const repoDist = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "dist", "lfg.js")
  try {
    await access(repoDist, constants.R_OK)
    return { command: process.execPath, prefix: [repoDist] }
  } catch {
    return null
  }
}
