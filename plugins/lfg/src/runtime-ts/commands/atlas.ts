import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { resolveLfgEnv, safeChildPath, type LfgEnv } from "../foundation/env"
import { GROK_ORACLE_REVIEW } from "../services/spawn-adapter"
import { loadPlan, savePlan, type PlanRecord, type PlanStep } from "./plan"

export type AtlasProgress = { total: number; completed: number; remaining: number; percent: number; blocked: Record<string, unknown>[]; nextTask: PlanStep | null }

export async function atlasStartWorkCommand(input: { planId?: string; plan_id?: string; sessionId?: string; session_id?: string }, env: LfgEnv = resolveLfgEnv(), now: () => string = utcNow): Promise<Record<string, unknown>> {
  const plan = await loadPlan(input.planId ?? input.plan_id, env)
  const boulder = await buildAndPersistBoulder(plan, env, input.sessionId ?? input.session_id ?? `atlas-${timestampId(now)}`, now)
  const progress = planProgress(plan)
  return { ok: true, operation: "atlas_start_work", mode: "init", agent: "atlas", planId: plan.id, activePlan: boulder.active_plan, boulderPath: boulderPath(plan.id, env), sessionIds: boulder.session_ids, progress: boulder.progress, nextTask: progress.nextTask, delegation: delegateRecord(plan, progress.nextTask), notepads: await initNotepads(plan.id, env), wisdom: {}, boulderMigration: { status: "none", applied: false }, atlasPolicy: { readsPlans: true, delegatesBoundedTasks: true, writesImplementationCode: false, evidenceRequiredForCheckbox: true } }
}

export async function atlasStatusCommand(input: { planId?: string; plan_id?: string }, env: LfgEnv = resolveLfgEnv(), now: () => string = utcNow): Promise<Record<string, unknown>> {
  const plan = await loadPlan(input.planId ?? input.plan_id, env)
  let boulder = await readJsonRecord(boulderPath(plan.id, env))
  if (Object.keys(boulder).length === 0) boulder = await buildAndPersistBoulder(plan, env, `atlas-${timestampId(now)}`, now)
  return { ok: true, operation: "atlas_status", planId: plan.id, boulderPath: boulderPath(plan.id, env), boulder, boulderMigration: { status: "current", applied: false }, progress: planProgress(plan), wisdom: {} }
}

export async function atlasCheckboxCommand(input: { planId?: string; plan_id?: string; task: number | string; status: string; evidence?: string }, env: LfgEnv = resolveLfgEnv(), now: () => string = utcNow): Promise<Record<string, unknown>> {
  const plan = await loadPlan(input.planId ?? input.plan_id, env)
  const taskId = String(input.task)
  const step = plan.steps.find((candidate) => String(candidate.id) === taskId)
  if (!step) throw new Error(`Atlas task not found: ${taskId}`)
  step.status = input.status
  step.updatedAt = now()
  step.evidence = input.evidence ?? ""
  step.evidenceArtifactPaths = []
  step.evidenceArtifacts = []
  step.oracleReview = GROK_ORACLE_REVIEW
  plan.updatedAt = now()
  const written = await savePlan(plan, env, now)
  const boulder = await buildAndPersistBoulder(plan, env, `atlas-${timestampId(now)}`, now)
  boulder.recent_evidence = [...(Array.isArray(boulder.recent_evidence) ? boulder.recent_evidence : []), { taskId, evidenceArtifactPaths: [], status: input.status, ts: now() }]
  await writeFile(boulderPath(plan.id, env), `${JSON.stringify(boulder, null, 2)}\n`, "utf8")
  const progress = planProgress(plan)
  return { ok: true, operation: "atlas_checkbox_update", planId: plan.id, taskId, status: input.status, step, progress: boulder.progress, nextTask: progress.nextTask, delegation: delegateRecord(plan, progress.nextTask), boulderPath: boulderPath(plan.id, env), notepads: await initNotepads(plan.id, env), wisdom: {}, paths: { json: written.json_path, markdown: written.markdown_path }, boulderMigration: { status: "current", applied: false }, atlasPolicy: { writesImplementationCode: false, evidenceRequiredForCheckbox: true } }
}

export function planProgress(plan: PlanRecord): AtlasProgress {
  const completedIds = new Set(plan.steps.filter((step) => ["complete", "completed", "pass", "passed", "done"].includes(step.status.toLowerCase())).map((step) => String(step.id)))
  const nextTask = plan.steps.find((step) => !completedIds.has(String(step.id)) && !["blocked", "cancelled"].includes(step.status.toLowerCase())) ?? null
  const total = plan.steps.length
  return { total, completed: completedIds.size, remaining: Math.max(total - completedIds.size, 0), percent: total === 0 ? 100 : Math.round((completedIds.size / total) * 10000) / 100, blocked: [], nextTask }
}

async function buildAndPersistBoulder(plan: PlanRecord, env: LfgEnv, sessionId: string, now: () => string): Promise<Record<string, unknown>> {
  await mkdir(join(env.data, "boulder", plan.id), { recursive: true })
  const progress = planProgress(plan)
  const boulder = { schema_version: 2, schemaVersion: 2, active_work_id: plan.id, active_plan: join(env.plansDir, `${plan.id}.json`), status: progress.remaining === 0 ? "complete" : "active", started_at: now(), updated_at: now(), session_ids: [sessionId], plan_name: plan.title, progress: withoutNext(progress), blockers: progress.blocked, next_task_id: progress.nextTask ? String(progress.nextTask.id) : null, notepads: await initNotepads(plan.id, env), recent_evidence: [], revision: 1 }
  await writeFile(boulderPath(plan.id, env), `${JSON.stringify(boulder, null, 2)}\n`, "utf8")
  await mkdir(env.stateDir, { recursive: true })
  await writeFile(join(env.stateDir, "atlas-boulder.json"), `${JSON.stringify({ planId: plan.id, path: boulderPath(plan.id, env), updatedAt: now(), revision: 1 }, null, 2)}\n`, "utf8")
  return boulder
}

async function initNotepads(planId: string, env: LfgEnv): Promise<Record<string, unknown>> {
  const root = safeChildPath(join(env.data, "notepads"), planId)
  await mkdir(root, { recursive: true })
  return { root, categories: ["learnings", "decisions", "issues", "verification", "problems"], paths: {} }
}

function delegateRecord(plan: PlanRecord, task: PlanStep | null): Record<string, unknown> | null {
  if (!task) return null
  return { agent: "sisyphus-junior", category: "deep", taskId: String(task.id), task: task.text, bounded: true, atlasWritesImplementationCode: false, planId: plan.id }
}

function boulderPath(planId: string, env: LfgEnv): string {
  return safeChildPath(join(env.data, "boulder", planId), "boulder.json")
}

function withoutNext(progress: AtlasProgress): Record<string, unknown> {
  return { total: progress.total, completed: progress.completed, remaining: progress.remaining, percent: progress.percent, blocked: progress.blocked }
}

async function readJsonRecord(path: string): Promise<Record<string, unknown>> {
  try { return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown> } catch { return {} }
}

function timestampId(now: () => string): string { return now().replace(/[-:TZ]/g, "").slice(0, 15) }
function utcNow(): string { return new Date().toISOString().replace(/\.\d{3}Z$/, "Z") }
