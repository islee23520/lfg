import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import type {
  BoulderState,
  BoulderWorkResumeOption,
  BoulderWorkState,
  PlanChecklist,
  StopHookContinuationContext,
  TaskSessionState,
} from "../types"
import { getBoulderFilePath, resolveBoulderPlanPathForWork } from "./path"
import { getPlanChecklist } from "../plan-checklist"
import { getPlanProgress } from "./plan-progress"
import { buildWorkFromMirror, isValidWorkStatus, normalizeSessionId, parseIsoToMs, projectWorkToMirror, selectMirrorWork } from "./shared"

export function readBoulderState(directory: string): BoulderState | null {
  const filePath = getBoulderFilePath(directory)
  if (!existsSync(filePath)) {
    return null
  }

  try {
    const content = readFileSync(filePath, "utf-8")
    const parsed = JSON.parse(content)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null
    }

    normalizeState(parsed)
    const state = parsed as BoulderState
    const mirrorWork = selectMirrorWork(state)
    if (mirrorWork) {
      state.active_work_id = mirrorWork.work_id
      projectWorkToMirror(state, mirrorWork)
    }

    return state
  } catch {
    return null
  }
}

function normalizeState(state: Record<string, unknown>): void {
  normalizeSessionFields(state)

  const sessionIds = Array.isArray(state.session_ids) ? state.session_ids : []

  const sessionOrigins = state.session_origins && typeof state.session_origins === "object" && !Array.isArray(state.session_origins)
    ? (state.session_origins as Record<string, unknown>)
    : {}
  state.session_origins = sessionOrigins

  if (sessionIds.length === 1) {
    const soleSessionId = sessionIds[0]
    if (
      typeof soleSessionId === "string"
      && sessionOrigins[soleSessionId] !== "appended"
      && sessionOrigins[soleSessionId] !== "direct"
    ) {
      sessionOrigins[soleSessionId] = "direct"
    }
  }

  if (!state.task_sessions || typeof state.task_sessions !== "object" || Array.isArray(state.task_sessions)) {
    state.task_sessions = {}
  }

  normalizeWorkSessionFields(state.works)
}

function normalizeSessionFields(target: Record<string, unknown>): void {
  const sessionIds = Array.isArray(target.session_ids)
    ? target.session_ids.filter((sessionId): sessionId is string => typeof sessionId === "string").map((sessionId) => normalizeSessionId(sessionId))
    : []
  target.session_ids = sessionIds

  const sessionOrigins = target.session_origins && typeof target.session_origins === "object" && !Array.isArray(target.session_origins)
    ? normalizeSessionOrigins(target.session_origins as Record<string, unknown>)
    : {}
  target.session_origins = sessionOrigins
}

function normalizeSessionOrigins(sessionOrigins: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(sessionOrigins).map(([sessionId, origin]) => [normalizeSessionId(sessionId), origin]),
  )
}

function normalizeWorkSessionFields(works: unknown): void {
  if (!works || typeof works !== "object" || Array.isArray(works)) {
    return
  }

  for (const work of Object.values(works)) {
    if (work && typeof work === "object" && !Array.isArray(work)) {
      normalizeSessionFields(work as Record<string, unknown>)
    }
  }
}

export function getBoulderWorks(state: BoulderState): BoulderWorkState[] {
  if (state.works && typeof state.works === "object") {
    return Object.values(state.works)
  }

  if (!state.active_plan || !state.plan_name || !state.started_at) {
    return []
  }

  return [buildWorkFromMirror(state)]
}

export function getActiveWorks(directory: string): BoulderWorkState[] {
  const state = readBoulderState(directory)
  if (!state) {
    return []
  }

  return getBoulderWorks(state).filter((work) => work.status !== "completed" && work.status !== "abandoned")
}

export function getWorkById(directory: string, workId: string): BoulderWorkState | null {
  const state = readBoulderState(directory)
  if (!state) {
    return null
  }

  return getBoulderWorks(state).find((work) => work.work_id === workId) ?? null
}

export function getWorkByPlanName(
  directory: string,
  planName: string,
  options?: { worktreePath?: string },
): BoulderWorkState | null {
  const state = readBoulderState(directory)
  if (!state) {
    return null
  }

  const worktreePath = options?.worktreePath
  return getBoulderWorks(state).find((work) => {
    if (work.plan_name !== planName) {
      return false
    }

    return worktreePath ? work.worktree_path === worktreePath : true
  }) ?? null
}

export function getWorkForSession(directory: string, sessionId: string): BoulderWorkState | null {
  const state = readBoulderState(directory)
  if (!state) {
    return null
  }

  const normalizedSessionId = normalizeSessionId(sessionId)
  let newestWork: BoulderWorkState | null = null
  let newestWorkMs = 0

  for (const work of getBoulderWorks(state)) {
    if (!work.session_ids.includes(normalizedSessionId)) {
      continue
    }

    const workMs = parseIsoToMs(work.updated_at ?? work.started_at) ?? 0
    if (!newestWork || workMs > newestWorkMs) {
      newestWork = work
      newestWorkMs = workMs
    }
  }

  if (newestWork) {
    return newestWork
  }

  return state.session_ids.includes(normalizedSessionId) ? buildWorkFromMirror(state) : null
}

export function getWorkResumeOptions(directory: string): BoulderWorkResumeOption[] {
  const state = readBoulderState(directory)
  if (!state) {
    return []
  }

  return getBoulderWorks(state)
    .filter((work) => work.status !== "completed" && work.status !== "abandoned")
    .map((work) => {
      const progress = getPlanProgress(resolveBoulderPlanPathForWork(directory, work))
      return {
        work_id: work.work_id,
        plan_name: work.plan_name,
        active_plan: work.active_plan,
        worktree_path: work.worktree_path,
        status: work.status && isValidWorkStatus(work.status) ? work.status : "active",
        started_at: work.started_at,
        updated_at: work.updated_at ?? work.started_at,
        ended_at: work.ended_at,
        elapsed_ms: work.elapsed_ms,
        session_count: work.session_ids.length,
        progress,
        is_current_mirror: state.active_work_id === work.work_id,
      }
    })
}

export function getTaskSessionState(directory: string, taskKey: string): TaskSessionState | null {
  const state = readBoulderState(directory)
  if (state?.active_work_id) {
    const work = state.works?.[state.active_work_id]
    const taskSession = work?.task_sessions?.[taskKey]
    if (taskSession) {
      return taskSession
    }
  }

  if (!state?.task_sessions) {
    return null
  }

  return state.task_sessions[taskKey] ?? null
}

/**
 * Pure helper for Continuation plane (checkbox 6).
 * Reads boulder.json (fail-closed on malformed/absent) + resolves plan path.
 * Emits structured context suitable for Stop/SubagentStop hook additionalContext.
 * Does NOT claim auto-reinjection or use private Grok APIs. Ledger path is
 * always emitted for durable start-work continuation via boulder-state.
 * Aligns with project-omo-ledger awareness and Sisyphus guidance.
 */
export function getStopHookContinuationContext(directory: string): StopHookContinuationContext {
  const boulderPath = getBoulderFilePath(directory)
  const ledgerPath = join(directory, ".omo", "start-work", "ledger.jsonl")
  const state = readBoulderState(directory)

  if (!state) {
    const hasFile = existsSync(boulderPath)
    const status = hasFile ? "malformed" : "absent"
    return {
      status,
      boulderPath,
      ledgerPath,
      hasActiveWork: false,
      activeWorkId: null,
      planPath: null,
      checklist: null,
      resumeOptions: [],
      additionalContext: `OMO continuation plane: ${status === "malformed" ? "malformed .omo/boulder.json fails closed" : "no active boulder state"}. ` +
        "Use explicit ledger-backed continuation from .omo/start-work/ledger.jsonl and boulder-state resumeOptions. " +
        "Sisyphus Stop/SubagentStop provides guidance only; no automatic reinjection (Deferred per host surface gap). " +
        `Ledger path: ${ledgerPath}`,
    }
  }

  const resumeOptions = getWorkResumeOptions(directory)
  const hasActiveWork = resumeOptions.length > 0 && resumeOptions.some((o) => o.status !== "completed" && o.status !== "abandoned")
  const activeWork = resumeOptions.find((o) => o.is_current_mirror) || resumeOptions[0]
  const activeWorkId = activeWork ? activeWork.work_id : null
  let planPath: string | null = null
  let checklist: PlanChecklist | null = null

  if (activeWork && activeWork.active_plan) {
    planPath = resolveBoulderPlanPathForWork(directory, {
      active_plan: activeWork.active_plan,
      worktree_path: activeWork.worktree_path,
    } as any)
    checklist = getPlanChecklist(planPath)
  }

  const contextLines = [
    "Grok ledger-backed start-work continuation context (boulder-state):",
    `Active work: ${hasActiveWork ? activeWorkId || "yes" : "none"}`,
    `Ledger: ${ledgerPath} (${hasActiveWork ? "active" : "check for entries"})`,
    `Plan: ${planPath || "none"}`,
    checklist && checklist.remaining > 0 ? `Unchecked items: ${checklist.remaining} (next: ${checklist.nextTaskLabel || "none"})` : "All plan checkboxes complete or no plan.",
    "",
    "Continuation contract (poll/ resume):",
    "- Use get_command_or_subagent_output(task_id) or wait_commands_or_subagents for background poll.",
    "- Resume via resume_from subagent id or explicit /start-work with boulder work_id.",
    "- For durable checkpoint/resume across sessions, use `lfg ulw-loop` (or `lfg ulw`); do not rely on host Stop hook for auto-restart.",
    "- Sisyphus Stop/SubagentStop provides guidance only; no automatic reinjection (Deferred per host surface gap).",
    "- Malformed .omo always fails closed.",
    "",
    "This is durable ledger guidance only. start-work-continuation CLI remains Deferred.",
  ].filter(Boolean)

  return {
    status: "present",
    boulderPath,
    ledgerPath,
    hasActiveWork,
    activeWorkId,
    planPath,
    checklist,
    resumeOptions,
    additionalContext: contextLines.join("\n"),
  }
}
