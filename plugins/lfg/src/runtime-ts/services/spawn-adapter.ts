import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { randomBytes } from "node:crypto"
import { resolveLfgEnv, safeChildPath, validateSafeId, type LfgEnv } from "../foundation/env"
import { loadOmoAgentRegistry } from "./agent-registry"
import { canonicalModelProvider, OMO_RUNTIME_FALLBACK_POLICY, resolveModelProfile, type ModelProfile, type ModelResolutionPolicy } from "./model-resolution"

export const GROK_ORACLE_REVIEW = { required: true, gate: "xai/grok", provider: "xai", model: "xai/grok-4.3", variant: "high", fallback_models: [], role: "oracle", strict: true, mode: "local-smoke", reviewKind: "static-local-schema", realGrokJudgment: false, status: "passed" } as const
export const REAL_GROK_AVAILABLE = false
export const SPAWN_ENVELOPE_SCHEMA_VERSION = 1
export const SPAWN_ENVELOPE_STATUSES = new Set(["completed", "blocked", "failed"])
export const SPAWN_ENVELOPE_MODES = new Set(["native-grok", "fallback"])
export const SPAWN_ENVELOPE_EVIDENCE_CLASSES = new Set(["dependency-free-smoke", "repo-native-integration", "real-grok-manual-gate"])
export const COMPLETION_STATUSES = new Set(["complete", "completed", "pass", "passed"])
export const SUPERVISION_BROKER_API = "internal-non-agent"
export const SUPERVISION_BROKER_VERSION = 1
export const SUPERVISION_BROKER_MAX_DEPTH = 2

export type FallbackSpawnEnvelope = {
  ok: boolean
  schemaVersion: number
  operation: string
  mode: "fallback" | "native-grok"
  status: "completed" | "blocked" | "failed"
  execution: Record<string, unknown>
  agent: string | null
  agentId: string | null
  agent_id: string | null
  category: string | null
  task: string | null
  taskId: string
  task_id: string
  runId: string
  run_id: string
  parentRunId: string | null
  children: Record<string, unknown>[]
  blockers: unknown[]
  touchedFiles: string[]
  touched_files: string[]
  evidence: unknown[]
  evidenceArtifactPaths: string[]
  evidenceArtifacts: string[]
  evidenceClass: string
  broker: BrokerDecision
  modelProfile: ModelProfile | Record<string, never>
  model_profile: ModelProfile | Record<string, never>
  modelResolution: ModelResolutionPolicy | Record<string, unknown>
  nextTasks: unknown[]
  oracleReview: typeof GROK_ORACLE_REVIEW
  debug: Record<string, unknown>
  manual_gate_required: boolean
  runtimeFallback?: typeof OMO_RUNTIME_FALLBACK_POLICY
  session_id?: string
  recordPath?: string
  record_path?: string
}

export type BrokerDecision = {
  api: typeof SUPERVISION_BROKER_API
  version: number
  operation: string
  selectedLane: string
  modelProfile: ModelProfile | Record<string, never>
  evidenceClass: string
  policyDecision: { allowed: boolean; policy: string; reason: string }
  lease: { depth: number; maxDepth: number; recursionControlled: boolean }
}

export type SpawnAgentOptions = { category?: string; task?: string; taskId?: string; task_id?: string; runId?: string; run_id?: string; parentRunId?: string; provider?: string; model?: string; reasoning?: string; mode?: string; native?: boolean; brokerDepth?: number; broker_depth?: number; brokerMaxDepth?: number; broker_max_depth?: number }

export async function spawnFallbackAgent(agentId: string, options: SpawnAgentOptions = {}, env: LfgEnv = resolveLfgEnv()): Promise<FallbackSpawnEnvelope> {
  const registry = await loadOmoAgentRegistry(join(env.root, "src", "agents"))
  const agent = registry.find((candidate) => candidate.id === agentId)
  const taskId = options.taskId ?? options.task_id
  const runId = options.runId ?? options.run_id
  const depth = options.brokerDepth ?? options.broker_depth ?? 0
  const maxDepth = options.brokerMaxDepth ?? options.broker_max_depth ?? SUPERVISION_BROKER_MAX_DEPTH
  if (!agent) return persistSpawnEnvelope(canonicalSpawnEnvelope({ status: "failed", ok: false, agentId, category: options.category, task: options.task, taskId, runId, blockers: [{ code: "unknown-agent", agent: agentId }], evidence: [{ summary: "spawn rejected before provider execution" }], broker: supervisionBrokerDecision({ operation: "spawn", lane: "fallback-local", modelProfile: {}, evidenceClass: "dependency-free-smoke", reason: "OMO policy selected bounded fallback lane; native Grok sub-agent primitive remains manual-gated", depth, maxDepth }), debug: { knownAgents: registry.map((item) => item.id).sort() } }), env)
  if (options.category && !agent.categories.includes(options.category)) return persistSpawnEnvelope(canonicalSpawnEnvelope({ status: "failed", ok: false, agentId, category: options.category, task: options.task, taskId, runId, blockers: [{ code: "unsupported-category", agent: agentId, category: options.category }], evidence: [{ summary: "category not supported for agent" }], broker: supervisionBrokerDecision({ operation: "spawn", lane: "fallback-local", modelProfile: {}, evidenceClass: "dependency-free-smoke", reason: "OMO policy selected bounded fallback lane; native Grok sub-agent primitive remains manual-gated", depth, maxDepth }), debug: { supportedCategories: agent.categories } }), env)
  const resolved = resolveModelProfile(agent, { category: options.category, provider: options.provider, model: options.model, reasoning: options.reasoning })
  if (!resolved.ok) return persistSpawnEnvelope(canonicalSpawnEnvelope({ status: resolved.status === "blocked" ? "blocked" : "failed", ok: false, agentId, category: options.category, task: options.task, taskId, runId, blockers: [{ code: resolved.error === "model-family mismatch" ? "model-family-mismatch" : "model-resolution-failed", detail: resolved.error }], evidence: [{ summary: "model resolution failed" }], broker: supervisionBrokerDecision({ operation: "spawn", lane: "fallback-local", modelProfile: {}, evidenceClass: "dependency-free-smoke", reason: "OMO policy selected bounded fallback lane; native Grok sub-agent primitive remains manual-gated", depth, maxDepth }), debug: resolved }), env)
  const broker = brokerDecision("spawn", resolved.modelProfile, options.provider ?? resolved.modelProfile.provider, depth, maxDepth)
  const evidence: Record<string, unknown>[] = [{ summary: `dependency-free fallback spawn for ${agentId}`, class: "dependency-free-smoke", providerOutput: "[not-executed:fallback]" }]
  const debug: Record<string, unknown> = { runtimeFallback: resolved.modelResolution.runtimeFallback }
  if (nativeSpawnRequested(options)) {
    evidence.push({ summary: "native Grok spawn requested but real manual gate evidence is absent; falling back deterministically", requiredEvidenceClass: "real-grok-manual-gate" })
    debug.nativeGate = { requested: true, available: false, modeReturned: "fallback" }
  }
  const envelope = canonicalSpawnEnvelope({ status: "completed", ok: true, agentId, category: options.category, task: options.task, taskId, runId, modelProfile: resolved.modelProfile, modelResolution: resolved.modelResolution, evidence, broker, debug, manualGateRequired: fallbackManualGateRequired(resolved.modelProfile, options) })
  envelope.runtimeFallback = resolved.modelResolution.runtimeFallback
  envelope.session_id = envelope.runId
  return persistSpawnEnvelope(envelope, env)
}

export function canonicalSpawnEnvelope(input: { status: FallbackSpawnEnvelope["status"]; ok: boolean; operation?: string; mode?: FallbackSpawnEnvelope["mode"]; agentId?: string | null; category?: string | null; task?: string | null; taskId?: string; runId?: string; parentRunId?: string | null; modelProfile?: ModelProfile | Record<string, never>; modelResolution?: ModelResolutionPolicy | Record<string, unknown>; children?: Record<string, unknown>[]; blockers?: unknown[]; touchedFiles?: string[]; evidence?: unknown[]; evidenceClass?: string; broker?: BrokerDecision; debug?: Record<string, unknown>; nextTasks?: unknown[]; manualGateRequired?: boolean }): FallbackSpawnEnvelope {
  const taskId = input.taskId ?? `task-${randomHex(8)}`
  const runId = input.runId ?? `run-${randomHex(12)}`
  const mode = input.mode ?? "fallback"
  const evidenceClass = input.evidenceClass ?? "dependency-free-smoke"
  const manualGate = input.manualGateRequired ?? evidenceClass === "real-grok-manual-gate"
  const actualChildExecution = mode === "native-grok" && evidenceClass === "real-grok-manual-gate" && !manualGate
  return { ok: input.ok, schemaVersion: SPAWN_ENVELOPE_SCHEMA_VERSION, operation: input.operation ?? "spawn", mode, status: input.status, execution: { adapterMode: mode, contractStatus: input.status, completionMeaning: actualChildExecution ? "child-execution-completed" : "contract-envelope-completed", actualChildExecution, nativeGrokSpawnVerified: actualChildExecution }, agent: input.agentId ?? null, agentId: input.agentId ?? null, agent_id: input.agentId ?? null, category: input.category ?? null, task: input.task ?? null, taskId, task_id: taskId, runId, run_id: runId, parentRunId: input.parentRunId ?? null, children: input.children ?? [], blockers: input.blockers ?? [], touchedFiles: input.touchedFiles ?? [], touched_files: input.touchedFiles ?? [], evidence: input.evidence ?? [], evidenceArtifactPaths: [], evidenceArtifacts: [], evidenceClass, broker: input.broker ?? supervisionBrokerDecision({ operation: input.operation ?? "spawn", lane: "fallback-local", modelProfile: input.modelProfile ?? {}, evidenceClass, reason: "default internal broker decision for canonical envelope normalization" }), modelProfile: input.modelProfile ?? {}, model_profile: input.modelProfile ?? {}, modelResolution: input.modelResolution ?? {}, nextTasks: input.nextTasks ?? [], oracleReview: GROK_ORACLE_REVIEW, debug: input.debug ?? {}, manual_gate_required: manualGate }
}

export function supervisionBrokerDecision(input: { operation: string; lane: string; modelProfile: ModelProfile | Record<string, never>; evidenceClass: string; reason: string; allowed?: boolean; policy?: string; depth?: number; maxDepth?: number }): BrokerDecision {
  const depth = input.depth ?? 0
  const maxDepth = input.maxDepth ?? SUPERVISION_BROKER_MAX_DEPTH
  return { api: SUPERVISION_BROKER_API, version: SUPERVISION_BROKER_VERSION, operation: input.operation, selectedLane: input.lane, modelProfile: input.modelProfile, evidenceClass: input.evidenceClass, policyDecision: { allowed: input.allowed ?? true, policy: input.policy ?? "omo-policy", reason: input.reason }, lease: { depth, maxDepth, recursionControlled: depth <= maxDepth } }
}

export function validateFallbackSpawnEnvelope(envelope: FallbackSpawnEnvelope): string[] {
  const errors: string[] = []
  if (envelope.schemaVersion !== SPAWN_ENVELOPE_SCHEMA_VERSION) errors.push("schemaVersion mismatch")
  if (!SPAWN_ENVELOPE_MODES.has(envelope.mode)) errors.push("mode must be native-grok or fallback")
  if (!SPAWN_ENVELOPE_STATUSES.has(envelope.status)) errors.push("status must be completed, blocked, or failed")
  if (!SPAWN_ENVELOPE_EVIDENCE_CLASSES.has(envelope.evidenceClass)) errors.push("invalid evidenceClass")
  if (envelope.broker.api !== SUPERVISION_BROKER_API) errors.push("broker.api must be internal-non-agent")
  if (envelope.oracleReview.required !== true) errors.push("oracleReview.required must be true")
  return errors
}

async function persistSpawnEnvelope(envelope: FallbackSpawnEnvelope, env: LfgEnv): Promise<FallbackSpawnEnvelope> {
  const dir = join(env.runsDir, "spawns")
  await mkdir(dir, { recursive: true })
  const path = safeChildPath(dir, `${validateSafeId(envelope.runId, "run id")}.json`)
  envelope.recordPath = path
  envelope.record_path = path
  await writeFile(path, `${JSON.stringify(envelope, null, 2)}\n`, "utf8")
  return envelope
}

function brokerDecision(operation: string, modelProfile: ModelProfile, provider: string, depth: number, maxDepth: number): BrokerDecision {
  const canonicalProvider = canonicalModelProvider(provider)
  return supervisionBrokerDecision({ operation, lane: canonicalProvider === "xai" || canonicalProvider === "grok" ? "fallback-local" : `approved-provider:${canonicalProvider}`, modelProfile, evidenceClass: "dependency-free-smoke", reason: "OMO policy selected bounded fallback lane; native Grok sub-agent primitive remains manual-gated", depth, maxDepth })
}

function fallbackManualGateRequired(modelProfile: ModelProfile, options: SpawnAgentOptions): boolean {
  const provider = canonicalModelProvider(modelProfile.provider ?? options.provider ?? "xai")
  return nativeSpawnRequested(options) || provider === "xai" || provider === "grok"
}

function nativeSpawnRequested(options: SpawnAgentOptions): boolean {
  const requested = options.mode ?? "fallback"
  return requested === "native" || requested === "native-grok" || requested === "grok-native" || options.native === true
}

function randomHex(length: number): string {
  return randomBytes(Math.ceil(length / 2)).toString("hex").slice(0, length)
}
