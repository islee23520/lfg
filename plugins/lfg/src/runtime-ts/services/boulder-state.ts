import {
  addBoulderWork as omoAddBoulderWork,
  completeBoulder as omoCompleteBoulder,
  createBoulderState as omoCreateBoulderState,
  getBoulderFilePath,
  readBoulderState as omoReadBoulderState,
  selectActiveWork as omoSelectActiveWork,
  writeBoulderState as omoWriteBoulderState,
  type BoulderState as OmoBoulderState,
} from "@oh-my-opencode/boulder-state"
import { resolveLfgEnv, type LfgEnv } from "../foundation/env"

export type BoulderState = OmoBoulderState & {
  schemaVersion: number
  currentGoal: string | null
  evidence: Record<string, unknown>[]
  blockers: Record<string, unknown>[]
  updatedAt: string
}

const DEFAULT_SESSION_ID = "lfg-boulder"

export const addBoulderWork = omoAddBoulderWork
export const completeBoulder = omoCompleteBoulder
export const selectActiveWork = omoSelectActiveWork

export function boulderStatePath(env: LfgEnv = resolveLfgEnv()): string {
  return getBoulderFilePath(env.data)
}

export function readBoulderState(env: LfgEnv = resolveLfgEnv(), now: () => string = utcNow): BoulderState {
  const state = omoReadBoulderState(env.data)
  return normalizeLegacyView(state, now)
}

export function writeBoulderState(state: BoulderState, env: LfgEnv = resolveLfgEnv()): boolean {
  return omoWriteBoulderState(env.data, state)
}

export function createBoulderState(goal: string, _env: LfgEnv = resolveLfgEnv(), now: () => string = utcNow): BoulderState {
  const state = omoCreateBoulderState(goal, DEFAULT_SESSION_ID)
  return normalizeLegacyView({ ...state, schemaVersion: 1, currentGoal: goal, evidence: [], blockers: [], updatedAt: now() } as unknown as BoulderState, now)
}

export function setBoulderGoal(goal: string, env: LfgEnv = resolveLfgEnv(), now: () => string = utcNow): BoulderState {
  const existing = omoReadBoulderState(env.data)
  const state = existing ? normalizeLegacyView(existing, now) : createBoulderState(goal, env, now)
  state.currentGoal = goal
  state.active_plan = goal
  state.plan_name = goal
  state.updatedAt = now()
  state.updated_at = state.updatedAt
  if (state.active_work_id && state.works?.[state.active_work_id]) {
    state.works[state.active_work_id] = { ...state.works[state.active_work_id], active_plan: goal, plan_name: goal, updated_at: state.updatedAt }
  }
  if (!writeBoulderState(state, env)) throw new Error("failed to write boulder state")
  return state
}

function normalizeLegacyView(state: OmoBoulderState | null, now: () => string): BoulderState {
  const fallbackNow = now()
  const base = state ?? omoCreateBoulderState("", DEFAULT_SESSION_ID)
  const record = base as OmoBoulderState & Partial<BoulderState>
  const updatedAt = typeof record.updatedAt === "string" ? record.updatedAt : record.updated_at ?? fallbackNow
  return {
    ...base,
    schemaVersion: typeof record.schemaVersion === "number" ? record.schemaVersion : 1,
    currentGoal: typeof record.currentGoal === "string" ? record.currentGoal : base.active_plan || null,
    evidence: Array.isArray(record.evidence) ? record.evidence : [],
    blockers: Array.isArray(record.blockers) ? record.blockers : [],
    updatedAt,
  }
}

function utcNow(): string { return new Date().toISOString().replace(/\.\d{3}Z$/, "Z") }
