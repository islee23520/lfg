import { access, open, readdir, stat } from "node:fs/promises"
import { join } from "node:path"

export type ProjectOmoLedgerOptions = {
  readonly projectRoot: string
  readonly sessionId: string | null
}

export type ProjectOmoLedgerSummary = {
  readonly status: "present" | "absent" | "malformed"
  readonly projectRoot: string
  readonly boulderPath: string
  readonly ledgerPath: string
  readonly work: ProjectOmoLedgerWork | null
  readonly ledgerExists: boolean
  readonly ledgerLineCount: number
  readonly matchedBy: "grok-session" | "codex-session" | "opencode-session" | "raw-session" | "active-work-id" | null
  readonly ulwLoop: ProjectOmoUlwLoopSummary | null
  readonly resumeOptions: readonly ProjectOmoAwarenessResumeOption[]
  readonly ledgerPreviews: readonly ProjectOmoLedgerPreview[]
}

export type ProjectOmoAwarenessResumeOption = {
  readonly workId: string
  readonly planName: string
  readonly status: string
  readonly activePlan: string
  readonly worktreePath: string | null
  readonly sessionCount: number
  readonly awarenessOnly: true
}

export type ProjectOmoLedgerPreview = {
  readonly source: "start-work" | "ulw-loop"
  readonly sessionId: string | null
  readonly lineCount: number
  readonly truncated: boolean
}

export type ProjectOmoUlwLoopSummary = {
  readonly present: boolean
  readonly sessionCount: number
  readonly hasActiveLedger: boolean
  readonly ledgerPreviews: readonly ProjectOmoLedgerPreview[]
}

export type ProjectOmoLedgerWork = {
  readonly workId: string
  readonly planName: string
  readonly status: string
  readonly activePlan: string
  readonly worktreePath: string | null
}

type BoulderWork = {
  readonly workId: string
  readonly planName: string
  readonly status: string
  readonly activePlan: string
  readonly worktreePath: string | null
  readonly sessionIds: readonly string[]
}

type BoulderState = {
  readonly activeWorkId: string | null
  readonly works: ReadonlyMap<string, BoulderWork>
}

const BOULDER_MAX_BYTES = 128 * 1024
const LEDGER_MAX_BYTES = 64 * 1024

export async function inspectProjectOmoLedger(options: ProjectOmoLedgerOptions): Promise<ProjectOmoLedgerSummary> {
  const boulderPath = join(options.projectRoot, ".omo", "boulder.json")
  const ledgerPath = join(options.projectRoot, ".omo", "start-work", "ledger.jsonl")
  const base = { projectRoot: options.projectRoot, boulderPath, ledgerPath }
  const raw = await readOptionalText(boulderPath)
  if (raw === null) {
    const ulwLoop = await inspectUlwLoop(options.projectRoot) ?? emptyUlwLoop()
    return { ...base, status: "absent", work: null, ledgerExists: false, ledgerLineCount: 0, matchedBy: null, ulwLoop, resumeOptions: [], ledgerPreviews: [] }
  }
  const state = parseBoulderState(raw)
  if (state === null) {
    const ulwLoop = await inspectUlwLoop(options.projectRoot) ?? emptyUlwLoop()
    return { ...base, status: "malformed", work: null, ledgerExists: false, ledgerLineCount: 0, matchedBy: null, ulwLoop, resumeOptions: [], ledgerPreviews: [] }
  }
  const match = findWork(state, options.sessionId)
  const ledger = await inspectLedger(ledgerPath)
  const ulwLoop = await inspectUlwLoop(options.projectRoot)
  return {
    ...base,
    status: "present",
    work: match?.work ?? null,
    ledgerExists: ledger.exists,
    ledgerLineCount: ledger.lineCount,
    matchedBy: match?.matchedBy ?? null,
    ulwLoop,
    resumeOptions: resumeOptionsFromState(state),
    ledgerPreviews: ledgerPreviews(ledger, ulwLoop),
  }
}

async function readOptionalText(path: string): Promise<string | null> {
  const result = await readLimitedText(path, BOULDER_MAX_BYTES)
  return result.exists ? result.text : null
}

type LimitedTextRead = {
  readonly exists: boolean
  readonly text: string
  readonly truncated: boolean
}

async function readLimitedText(path: string, maxBytes: number): Promise<LimitedTextRead> {
  try {
    const fileStat = await stat(path)
    if (!fileStat.isFile()) return { exists: false, text: "", truncated: false }
    const handle = await open(path, "r")
    try {
      const bytesToRead = Math.min(fileStat.size, maxBytes)
      const buffer = Buffer.alloc(bytesToRead)
      const { bytesRead } = await handle.read(buffer, 0, bytesToRead, 0)
      return { exists: true, text: buffer.subarray(0, bytesRead).toString("utf8"), truncated: fileStat.size > maxBytes }
    } finally {
      await handle.close()
    }
  } catch {
    return { exists: false, text: "", truncated: false }
  }
}

function parseBoulderState(raw: string): BoulderState | null {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) return null
    const activeWorkId = stringField(parsed, "active_work_id") ?? stringField(parsed, "activeWorkId")
    const works = isRecord(parsed.works) ? parseWorksMap(parsed.works) : parseLegacySingleWork(parsed)
    return works.size > 0 ? { activeWorkId, works } : null
  } catch {
    return null
  }
}

function parseWorksMap(worksValue: Record<string, unknown>): ReadonlyMap<string, BoulderWork> {
  const works = new Map<string, BoulderWork>()
  for (const [key, value] of Object.entries(worksValue)) {
    const parsedWork = parseWork(key, value)
    if (parsedWork !== null) works.set(parsedWork.workId, parsedWork)
  }
  return works
}

function parseLegacySingleWork(value: Record<string, unknown>): ReadonlyMap<string, BoulderWork> {
  const work = parseWork("active", value)
  return work === null ? new Map<string, BoulderWork>() : new Map([[work.workId, work]])
}

function parseWork(fallbackId: string, value: unknown): BoulderWork | null {
  if (!isRecord(value)) return null
  const workId = stringField(value, "work_id") ?? stringField(value, "workId") ?? fallbackId
  const planName = stringField(value, "plan_name") ?? stringField(value, "planName") ?? workId
  const status = stringField(value, "status") ?? "unknown"
  const activePlan = stringField(value, "active_plan") ?? stringField(value, "activePlan") ?? ""
  const worktreePath = nullableStringField(value, "worktree_path") ?? nullableStringField(value, "worktreePath")
  const rawSessionIds = Array.isArray(value.session_ids) ? value.session_ids : Array.isArray(value.sessionIds) ? value.sessionIds : []
  const sessionIds = rawSessionIds.filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
  return { workId, planName, status, activePlan, worktreePath, sessionIds }
}

function findWork(state: BoulderState, sessionId: string | null): { readonly work: ProjectOmoLedgerWork; readonly matchedBy: ProjectOmoLedgerSummary["matchedBy"] } | null {
  const sessionMatches = sessionId !== null ? ([
    { session: `grok:${sessionId}`, matchedBy: "grok-session" as const },
    { session: `codex:${sessionId}`, matchedBy: "codex-session" as const },
    { session: `opencode:${sessionId}`, matchedBy: "opencode-session" as const },
    { session: sessionId, matchedBy: "raw-session" as const },
  ] as const) : []
  for (const candidate of sessionMatches) {
    for (const work of state.works.values()) {
      if (work.sessionIds.includes(candidate.session)) return { work: publicWork(work), matchedBy: candidate.matchedBy }
    }
  }
  if (state.activeWorkId !== null) {
    const active = state.works.get(state.activeWorkId)
    if (active !== undefined) return { work: publicWork(active), matchedBy: "active-work-id" }
  }
  return null
}

function publicWork(work: BoulderWork): ProjectOmoLedgerWork {
  return {
    workId: work.workId,
    planName: work.planName,
    status: work.status,
    activePlan: work.activePlan,
    worktreePath: work.worktreePath,
  }
}

async function inspectLedger(path: string): Promise<{ readonly exists: boolean; readonly lineCount: number; readonly truncated: boolean }> {
  try {
    await access(path)
  } catch {
    return { exists: false, lineCount: 0, truncated: false }
  }
  const result = await readLimitedText(path, LEDGER_MAX_BYTES)
  if (!result.exists) return { exists: false, lineCount: 0, truncated: false }
  const lineCount = result.text.split("\n").filter((line) => line.length > 0).length
  return { exists: true, lineCount, truncated: result.truncated }
}

function resumeOptionsFromState(state: BoulderState): readonly ProjectOmoAwarenessResumeOption[] {
  return [...state.works.values()].map((work) => ({
    workId: work.workId,
    planName: work.planName,
    status: work.status,
    activePlan: work.activePlan,
    worktreePath: work.worktreePath,
    sessionCount: work.sessionIds.length,
    awarenessOnly: true,
  }))
}

function ledgerPreviews(
  ledger: { readonly exists: boolean; readonly lineCount: number; readonly truncated: boolean },
  ulwLoop: ProjectOmoUlwLoopSummary | null,
): readonly ProjectOmoLedgerPreview[] {
  const previews: ProjectOmoLedgerPreview[] = []
  if (ledger.exists) {
    previews.push({ source: "start-work", sessionId: null, lineCount: ledger.lineCount, truncated: ledger.truncated })
  }
  previews.push(...(ulwLoop?.ledgerPreviews ?? []))
  return previews
}

function emptyUlwLoop(): ProjectOmoUlwLoopSummary {
  return { present: false, sessionCount: 0, hasActiveLedger: false, ledgerPreviews: [] }
}

async function inspectUlwLoop(projectRoot: string): Promise<ProjectOmoUlwLoopSummary | null> {
  const loopRoot = join(projectRoot, ".omo", "ulw-loop")
  try {
    const entries = await readdir(loopRoot, { withFileTypes: true })
    const sessions = entries.filter((e) => e.isDirectory() && /^[0-9a-f-]{8,}$/i.test(e.name))
    if (sessions.length === 0) {
      return emptyUlwLoop()
    }
    let hasActiveLedger = false
    const ledgerPreviews: ProjectOmoLedgerPreview[] = []
    for (const s of sessions) {
      const ledgerPath = join(loopRoot, s.name, "ledger.jsonl")
      const preview = await inspectLedger(ledgerPath)
      if (preview.exists && preview.lineCount > 0) {
        hasActiveLedger = true
        ledgerPreviews.push({ source: "ulw-loop", sessionId: s.name, lineCount: preview.lineCount, truncated: preview.truncated })
      }
    }
    return { present: true, sessionCount: sessions.length, hasActiveLedger, ledgerPreviews }
  } catch {
    // no .omo/ulw-loop directory or not readable
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function stringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key]
  return typeof value === "string" && value.length > 0 ? value : null
}

function nullableStringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key]
  return typeof value === "string" && value.length > 0 ? value : null
}
