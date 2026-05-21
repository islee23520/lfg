import { resolveLfgEnv, type LfgEnv } from "../foundation/env"
import { boulderStatePath, readBoulderState, setBoulderGoal, writeBoulderState } from "../services/boulder-state"

export type { BoulderState } from "../services/boulder-state"

export async function boulderStatusCommand(env: LfgEnv = resolveLfgEnv(), now: () => string = utcNow): Promise<Record<string, unknown>> {
  const state = readBoulderState(env, now)
  return { ok: true, operation: "boulder_status", state, path: boulderStatePath(env) }
}

export async function boulderSetGoalCommand(input: { goal: string }, env: LfgEnv = resolveLfgEnv(), now: () => string = utcNow): Promise<Record<string, unknown>> {
  const state = setBoulderGoal(input.goal, env, now)
  return { ok: true, operation: "boulder_set_goal", state, path: boulderStatePath(env) }
}

export async function boulderAddEvidenceCommand(input: { evidence: string; taskId?: string }, env: LfgEnv = resolveLfgEnv(), now: () => string = utcNow): Promise<Record<string, unknown>> {
  const state = readBoulderState(env, now)
  state.evidence.push({ evidence: input.evidence, taskId: input.taskId, ts: now() })
  state.updatedAt = now()
  state.updated_at = state.updatedAt
  if (!writeBoulderState(state, env)) throw new Error("failed to write boulder state")
  return { ok: true, operation: "boulder_add_evidence", state, path: boulderStatePath(env) }
}

export async function boulderAddBlockerCommand(input: { blocker: string; code?: string }, env: LfgEnv = resolveLfgEnv(), now: () => string = utcNow): Promise<Record<string, unknown>> {
  const state = readBoulderState(env, now)
  state.blockers.push({ reason: input.blocker, code: input.code, ts: now() })
  state.updatedAt = now()
  state.updated_at = state.updatedAt
  if (!writeBoulderState(state, env)) throw new Error("failed to write boulder state")
  return { ok: true, operation: "boulder_add_blocker", state, path: boulderStatePath(env) }
}

function utcNow(): string { return new Date().toISOString().replace(/\.\d{3}Z$/, "Z") }
