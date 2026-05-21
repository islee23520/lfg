import { mkdir, readdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { randomBytes } from "node:crypto"
import { resolveLfgEnv, safeChildPath, validateSafeId, type LfgEnv } from "../foundation/env"
import { bootstrapState } from "../foundation/state-schema"
import { GROK_ORACLE_REVIEW } from "../services/spawn-adapter"

export type PlanStep = { id: number; status: string; text: string; updatedAt?: string; evidence?: string; evidenceArtifactPaths?: string[]; evidenceArtifacts?: string[]; oracleReview?: typeof GROK_ORACLE_REVIEW }
export type PlanRecord = { id: string; title: string; status: string; createdAt: string; updatedAt: string; steps: PlanStep[]; questions: string[]; metis_gap_analysis: Record<string, unknown>; momus_review: Record<string, unknown>; oracleReview: typeof GROK_ORACLE_REVIEW; json_path?: string; state_json_path?: string; markdown_path?: string; markdown_content?: string; preview?: Record<string, unknown>; path?: string }
export type PlanCreateInput = { title: string; steps?: string; cwd?: string; interview?: boolean }

export async function planCreateCommand(input: PlanCreateInput, env: LfgEnv = resolveLfgEnv(), now: () => string = utcNow): Promise<PlanRecord> {
  await bootstrapState(env, now)
  const isUnderspecified = !input.steps || input.interview === true
  const id = `plan-${timestampId(now)}-${randomBytes(3).toString("hex")}`
  const steps = isUnderspecified ? [] : splitSteps(input.steps).map((text, index) => ({ id: index + 1, status: "pending", text }))
  const plan: PlanRecord = { id, title: input.title, status: isUnderspecified ? "awaiting_answers" : "active", createdAt: now(), updatedAt: now(), steps, questions: isUnderspecified ? ["What is the core objective of this work?", "What are the scope boundaries (what is NOT included)?", "Are there any critical technical ambiguities to resolve?", "What is the preferred technical approach?", "What is the test and verification strategy?"] : [], metis_gap_analysis: { status: "pending", findings: [] }, momus_review: { status: "pending", verdict: null }, oracleReview: GROK_ORACLE_REVIEW }
  return writePlanArtifacts(plan, env, now)
}

export async function planListCommand(input: { limit?: number } = {}, env: LfgEnv = resolveLfgEnv()): Promise<{ count: number; plans: PlanRecord[] }> {
  await mkdir(env.plansDir, { recursive: true })
  const files = (await readdir(env.plansDir)).filter((file) => file.endsWith(".json")).sort()
  const selected = input.limit ? files.slice(-input.limit) : files
  const plans: PlanRecord[] = []
  for (const file of selected) {
    const parsed = JSON.parse(await readFile(join(env.plansDir, file), "utf8")) as PlanRecord
    plans.push({ ...parsed, path: join(env.plansDir, file) })
  }
  return { count: plans.length, plans }
}

export async function loadPlan(planId: string | undefined, env: LfgEnv = resolveLfgEnv()): Promise<PlanRecord> {
  const selected = planId ?? (await latestPlanId(env))
  if (!selected) throw new Error("no active plan found for Atlas")
  validateSafeId(selected, "plan id")
  const path = safeChildPath(env.plansDir, `${selected}.json`)
  const parsed = JSON.parse(await readFile(path, "utf8")) as PlanRecord
  if (parsed.status === "awaiting_answers") throw new Error(`plan ${selected} is awaiting answers; run lfg plan answer before Atlas`)
  return { ...parsed, id: parsed.id || selected }
}

export async function savePlan(plan: PlanRecord, env: LfgEnv = resolveLfgEnv(), now: () => string = utcNow): Promise<PlanRecord> {
  return writePlanArtifacts(plan, env, now)
}

export async function writePlanArtifacts(plan: PlanRecord, env: LfgEnv, now: () => string = utcNow): Promise<PlanRecord> {
  await mkdir(env.plansDir, { recursive: true })
  await mkdir(join(env.stateDir, "plans"), { recursive: true })
  const jsonPath = safeChildPath(env.plansDir, `${validateSafeId(plan.id, "plan id")}.json`)
  const stateJsonPath = safeChildPath(join(env.stateDir, "plans"), `${plan.id}.json`)
  const mdPath = safeChildPath(env.plansDir, `${plan.id}.md`)
  const markdown = renderPlanMarkdown(plan)
  const persisted: PlanRecord = { ...plan }
  await writeFile(jsonPath, `${JSON.stringify(persisted, null, 2)}\n`, "utf8")
  await writeFile(stateJsonPath, `${JSON.stringify(persisted, null, 2)}\n`, "utf8")
  await writeFile(mdPath, markdown, "utf8")
  await writeFile(join(env.stateDir, "current-plan.json"), `${JSON.stringify({ id: plan.id, json: jsonPath, markdown: mdPath, updatedAt: now() }, null, 2)}\n`, "utf8")
  return { ...persisted, json_path: jsonPath, state_json_path: stateJsonPath, markdown_path: mdPath, markdown_content: markdown, preview: { type: "plan_preview", title: plan.title, id: plan.id, status: plan.status, created_at: plan.createdAt, markdown, steps: plan.steps, paths: { markdown: mdPath, json: jsonPath }, interactive: { supports_checkboxes: plan.status !== "awaiting_answers", checkbox_format: "markdown_task_list" } } }
}

function renderPlanMarkdown(plan: PlanRecord): string {
  const lines = [`# Plan: ${plan.title}`, "", `**ID**: \`${plan.id}\``, `**Status**: \`${plan.status}\``, `**Created**: ${plan.createdAt}`, ""]
  if (plan.status === "awaiting_answers") lines.push("## Planning Questions (Awaiting Answers)", "", ...plan.questions.map((question) => `- ${question}`))
  else lines.push("## Steps", "", ...plan.steps.map((step) => `- [${step.status === "pending" ? " " : "x"}] ${step.id}. ${step.text}`))
  lines.push("", "## Notes", "", "_Add evidence, blockers, and updates here. This file lives in `.lfg/plans/` so it is durable across sessions._", "")
  return lines.join("\n")
}

function splitSteps(steps: string | undefined): string[] {
  return (steps ?? "").split(/[\n;]/).map((step) => step.trim()).filter(Boolean)
}

async function latestPlanId(env: LfgEnv): Promise<string | undefined> {
  const files = (await readdir(env.plansDir)).filter((file) => file.endsWith(".json")).sort()
  return files.at(-1)?.replace(/\.json$/, "")
}

function timestampId(now: () => string): string {
  return now().replace(/[-:TZ]/g, "").slice(0, 15)
}

function utcNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z")
}
