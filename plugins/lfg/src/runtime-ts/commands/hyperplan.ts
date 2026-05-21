import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { randomBytes } from "node:crypto"
import { resolveLfgEnv, safeChildPath, validateSafeId, type LfgEnv } from "../foundation/env"
import { GROK_ORACLE_REVIEW } from "../services/spawn-adapter"

const REQUIRED = ["quick", "deep", "ultrabrain"] as const
const OPTIONAL = ["artistry", "visual-engineering"] as const

export async function hyperplanCommand(input: { objective: string; runId?: string; run_id?: string; noDeep?: boolean; no_deep?: boolean; simulateMissingSynthesis?: boolean; simulate_missing_synthesis?: boolean }, env: LfgEnv = resolveLfgEnv(), now: () => string = utcNow): Promise<Record<string, unknown>> {
  const runId = validateSafeId(input.runId ?? input.run_id ?? `hp-${randomBytes(6).toString("hex")}`, "hyperplan run id")
  const categories = [...REQUIRED, ...((input.noDeep ?? input.no_deep) ? [] : OPTIONAL)]
  const critics = categories.map((category, index) => ({ id: `critic-${index + 1}`, name: `${category}-critic`, category, role: "hostile-critic", provider: "noop", bounded: true, blockedTools: ["spawn", "spawn_wave", "dependency_graph"], teamEligibility: "category-member" }))
  const taskGraph = hyperplanTaskGraph(critics)
  const critiqueRounds = ["initial-hostile-review", "second-pass", "final-objection"].map((name, round) => ({ round: round + 1, name, entries: critics.map((critic) => ({ criticId: critic.id, critic: critic.name, category: critic.category, finding: `${name} requires concrete acceptance evidence and rejects vague freeform chat.` })) }))
  const revisionRounds = ["revision-1", "revision-2", "revision-3"].map((name, round) => ({ round: round + 1, name, revision: `${name} narrows '${input.objective}' into bounded tasks with measurable evidence.` }))
  const missing = input.simulateMissingSynthesis ?? input.simulate_missing_synthesis ?? false
  const leadSynthesis = missing ? null : { author: "lead", status: "present", criticCount: critics.length, critiqueRoundCount: critiqueRounds.length, revisionRoundCount: revisionRounds.length, summary: `Lead synthesis for '${input.objective}' keeps only evidence-backed planning constraints.` }
  const finalPlan = leadSynthesis ? { title: `Hyperplan final plan: ${input.objective}`, source: "lead-synthesis", steps: ["Confirm scope and acceptance criteria.", "Execute the dependency graph in order.", "Collect command-output or envelope evidence for every completion.", "Run final xAI/Grok Oracle-gated verification before handoff."], taskGraph } : null
  const status = leadSynthesis && finalPlan ? "completed" : "blocked"
  const artifactPath = safeChildPath(join(env.data, "hyperplan", runId), "artifact.json")
  const artifact = { ok: status === "completed", schemaVersion: 1, operation: "hyperplan", runId, teamRunId: `hyperplan-${runId}`, objective: input.objective, status, createdAt: now(), updatedAt: now(), evidenceClass: "dependency-free-smoke", oracleReview: GROK_ORACLE_REVIEW, boundedRoster: true, maxCritics: 5, critics, requiredCriticCategories: [...REQUIRED], optionalCriticCategories: [...OPTIONAL], critiqueRounds, revisionRounds, leadSynthesis, finalPlan, taskGraph, blockers: status === "completed" ? [] : [{ code: "missing-lead-synthesis", reason: "Hyperplan cannot complete without lead synthesis." }], artifactPath, durableState: { layout: ".lfg/hyperplan/<run-id>/artifact.json", artifactJson: artifactPath } }
  await mkdir(join(env.data, "hyperplan", runId), { recursive: true })
  await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8")
  return artifact
}

function hyperplanTaskGraph(critics: { id: string; name: string }[]): Record<string, unknown>[] {
  const critiques = critics.map((critic) => ({ id: `critique-${critic.id}`, owner: critic.name, kind: "critique", dependsOn: [] as string[] }))
  const revisions = ["revision-1", "revision-2", "revision-3"].map((id, index) => ({ id, owner: "leader", kind: "revision", dependsOn: index === 0 ? critiques.map((task) => task.id) : [`revision-${index}`] }))
  return [...critiques, ...revisions, { id: "lead-synthesis", owner: "leader", kind: "synthesis", dependsOn: ["revision-3"] }, { id: "final-plan", owner: "leader", kind: "final-plan", dependsOn: ["lead-synthesis"] }]
}

function utcNow(): string { return new Date().toISOString().replace(/\.\d{3}Z$/, "Z") }
