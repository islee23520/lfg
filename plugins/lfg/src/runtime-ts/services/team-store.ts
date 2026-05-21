import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { randomBytes } from "node:crypto"
import { resolveLfgEnv, safeChildPath, validateSafeId, type LfgEnv } from "../foundation/env"
import { supervisionBrokerDecision } from "./spawn-adapter"

export type TeamRunStatus = "planned" | "running" | "paused" | "completed" | "shutdown" | "deleted"
export type MemberStatus = "pending" | "active" | "completed" | "failed" | "shutdown_requested" | "shutdown_approved"
export type TaskStatus = "pending" | "claimed" | "in_progress" | "completed" | "blocked" | "deleted"
export type MessageType = "task_assignment" | "progress" | "evidence" | "evidence_submission" | "ack" | "command" | "message" | "shutdown"
export type TeamMember = { id: string; name: string; role: string; provider: string; status: MemberStatus; prompt: string; command: string; subagent_id: string | null; ultragoal: string | null; spawned_as_subagent: boolean | string; spawn_envelope: Record<string, unknown> | null; spawned_as_subagent_status: string | null; subagent_spawn_status: string | null; last_heartbeat: string | null; kind: string; session_id: string | null; shutdown_requested_at: string | null; shutdown_decision: string | null }
export type TeamMessage = { id: string; from_member: string; to_member: string; type: MessageType; payload: Record<string, unknown>; ts: string }
export type TeamTask = { id: string; title: string; description: string; status: TaskStatus; claimed_by: string | null; owner: string | null; dependencies: string[]; evidence: string; evidenceArtifactPaths: string[]; ts: string }
export type TeamRun = { id: string; name: string; objective: string; status: TeamRunStatus; created_at: string; updated_at: string; ultragoal_id: string | null; leader: string | null; config: Record<string, unknown>; members: TeamMember[]; tasks: TeamTask[]; mailbox: TeamMessage[]; tmux_session: string | null }

export class TeamStateStore {
  readonly base: string
  readonly mode: string | null
  readonly modeId: string | null
  readonly dryRun: boolean

  constructor(options: { baseDir?: string; mode?: string; modeId?: string; dryRun?: boolean; env?: LfgEnv } = {}) {
    const env = options.env ?? resolveLfgEnv()
    this.mode = options.mode ?? null
    this.modeId = options.modeId ?? null
    this.base = options.baseDir ?? getModeAwareBase(env, this.mode, this.modeId)
    this.dryRun = options.dryRun ?? false
  }

  runDir(teamId: string): string {
    const safe = validateSafeId(teamId, "team name")
    return this.mode && this.modeId ? safeChildPath(this.base, "teams", safe) : safeChildPath(this.base, safe)
  }

  async saveRun(run: TeamRun): Promise<void> {
    if (this.dryRun) return
    const dir = this.runDir(run.id)
    await mkdir(dir, { recursive: true })
    const runData = { id: run.id, name: run.name, objective: run.objective, status: run.status, created_at: run.created_at, updated_at: run.updated_at, ultragoal_id: run.ultragoal_id, leader: run.leader, config: run.config, tmux_session: run.tmux_session, mode: this.mode, mode_id: this.modeId }
    await Promise.all([writeJson(join(dir, "run.json"), runData), writeJson(join(dir, "members.json"), run.members), writeJson(join(dir, "tasks.json"), run.tasks), writeJson(join(dir, "mailbox.json"), run.mailbox)])
  }

  async loadRun(teamId: string): Promise<TeamRun | null> {
    const dir = this.runDir(teamId)
    const data = await readJsonRecord(join(dir, "run.json"))
    if (!data) return null
    return { id: String(data.id), name: String(data.name), objective: String(data.objective), status: toTeamRunStatus(data.status), created_at: asString(data.created_at), updated_at: asString(data.updated_at), ultragoal_id: asNullableString(data.ultragoal_id), leader: asNullableString(data.leader), config: isRecord(data.config) ? data.config : {}, tmux_session: asNullableString(data.tmux_session), members: await readJsonArray<TeamMember>(join(dir, "members.json")), tasks: await readJsonArray<TeamTask>(join(dir, "tasks.json")), mailbox: await readJsonArray<TeamMessage>(join(dir, "mailbox.json")) }
  }

  async listRuns(): Promise<string[]> {
    const root = this.mode && this.modeId ? join(this.base, "teams") : this.base
    try {
      return (await readdir(root, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
    } catch {
      return []
    }
  }

  async deleteRun(teamId: string): Promise<void> {
    if (!this.dryRun) await rm(this.runDir(teamId), { recursive: true, force: true })
  }
}

export class TeamMailbox {
  constructor(readonly store: TeamStateStore, readonly teamId: string) {}
  async send(fromMember: string, toMember: string, type: MessageType, payload: Record<string, unknown>, ultragoalId?: string): Promise<TeamMessage> {
    const run = await this.requireRun()
    if (type === "evidence_submission" && ultragoalId) payload._ulw_checkpoint_hint = `ulw ultragoal checkpoint --id ${ultragoalId} --status complete --evidence "..." --story <id>`
    const message: TeamMessage = { id: `msg-${randomHex(12)}`, from_member: fromMember, to_member: toMember, type, payload, ts: utcNow() }
    run.mailbox.push(message)
    run.updated_at = utcNow()
    await this.writeInboxMessage(message)
    await this.store.saveRun(run)
    return message
  }
  async poll(forMember: string): Promise<TeamMessage[]> {
    const run = await this.store.loadRun(this.teamId)
    return run?.mailbox.filter((message) => message.to_member === forMember) ?? []
  }
  async ack(messageId: string): Promise<boolean> {
    const run = await this.store.loadRun(this.teamId)
    if (!run) return false
    const before = run.mailbox.length
    run.mailbox = run.mailbox.filter((message) => message.id !== messageId)
    await this.store.saveRun(run)
    return run.mailbox.length < before
  }
  async sendEvidence(fromWorker: string, ultragoalId: string, evidence: string, story = "S001"): Promise<TeamMessage> {
    return this.send(fromWorker, "leader", "evidence_submission", { evidence, story, checkpoint_command: `ulw ultragoal checkpoint --id ${ultragoalId} --status complete --evidence "${evidence}" --story ${story}` }, ultragoalId)
  }
  private async requireRun(): Promise<TeamRun> {
    const run = await this.store.loadRun(this.teamId)
    if (!run) throw new Error(`team not found: ${this.teamId}`)
    return run
  }
  private async writeInboxMessage(message: TeamMessage): Promise<void> {
    if (this.store.dryRun) return
    const inbox = safeChildPath(this.store.runDir(this.teamId), "inboxes", validateSafeId(message.to_member, "mailbox member"))
    await mkdir(join(inbox, "processed"), { recursive: true })
    await writeJson(safeChildPath(inbox, `${validateSafeId(message.id, "message id")}.json`), message)
  }
}

export class TeamTasklist {
  constructor(readonly store: TeamStateStore, readonly teamId: string) {}
  async createTask(title: string, description = "", dependencies: string[] = [], owner: string | null = null): Promise<TeamTask> {
    const run = await this.requireRun()
    const task: TeamTask = { id: `task-${run.tasks.length + 1}`, title, description, status: owner ? "claimed" : "pending", claimed_by: owner, owner, dependencies, evidence: "", evidenceArtifactPaths: [], ts: utcNow() }
    run.tasks.push(task)
    run.updated_at = utcNow()
    await this.store.saveRun(run)
    return task
  }
  async claimTask(taskId: string, workerId: string): Promise<TeamTask | null> {
    const run = await this.requireRun()
    const task = run.tasks.find((item) => item.id === taskId && item.status === "pending")
    if (!task || !task.dependencies.every((dep) => run.tasks.some((item) => item.id === dep && item.status === "completed"))) return null
    task.status = "claimed"; task.claimed_by = workerId; task.owner = workerId; task.ts = utcNow(); await this.store.saveRun(run); return task
  }
  async submitEvidence(taskId: string, workerId: string, evidence: string, evidenceArtifactPaths: string[] = []): Promise<boolean> {
    const run = await this.requireRun()
    const task = run.tasks.find((item) => item.id === taskId && item.claimed_by === workerId)
    if (!task) return false
    task.evidence = evidence; task.evidenceArtifactPaths = evidenceArtifactPaths; task.status = "in_progress"; task.ts = utcNow(); await this.store.saveRun(run); return true
  }
  async getPendingTasks(): Promise<TeamTask[]> {
    const run = await this.store.loadRun(this.teamId)
    return run?.tasks.filter((task) => task.status === "pending") ?? []
  }
  private async requireRun(): Promise<TeamRun> { const run = await this.store.loadRun(this.teamId); if (!run) throw new Error(`team not found: ${this.teamId}`); return run }
}

export async function createTeamRun(store: TeamStateStore, name: string, objective: string, ultragoalId: string | null = null, config: Record<string, unknown> = {}): Promise<TeamRun> {
  const safeName = validateSafeId(name, "team name")
  const run: TeamRun = { id: safeName, name: safeName, objective, status: "planned", created_at: utcNow(), updated_at: utcNow(), ultragoal_id: ultragoalId, leader: null, config: { ...config, supervisionBroker: supervisionBrokerDecision({ operation: "TeamRuntime.create", lane: "team-runtime:state-only", modelProfile: {}, evidenceClass: "dependency-free-smoke", reason: "internal broker records TeamRuntime orchestration without becoming a team member" }) }, members: [], tasks: [], mailbox: [], tmux_session: null }
  await store.saveRun(run)
  return run
}

export function getModeAwareBase(env: LfgEnv, mode: string | null, modeId: string | null): string { return mode && modeId ? join(env.runsDir, `${mode}-${modeId}`) : join(env.stateDir, "teams") }
function utcNow(): string { return new Date().toISOString().replace(/\.\d{3}Z$/, "Z") }
function randomHex(length: number): string { return randomBytes(Math.ceil(length / 2)).toString("hex").slice(0, length) }
async function writeJson(path: string, value: unknown): Promise<void> { await mkdir(dirname(path), { recursive: true }); await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8") }
async function readJsonRecord(path: string): Promise<Record<string, unknown> | null> { try { const parsed: unknown = JSON.parse(await readFile(path, "utf8")); return isRecord(parsed) ? parsed : null } catch { return null } }
async function readJsonArray<T>(path: string): Promise<T[]> { try { const parsed: unknown = JSON.parse(await readFile(path, "utf8")); return Array.isArray(parsed) ? parsed as T[] : [] } catch { return [] } }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value) }
function asString(value: unknown): string { return typeof value === "string" ? value : "" }
function asNullableString(value: unknown): string | null { return typeof value === "string" ? value : null }
function toTeamRunStatus(value: unknown): TeamRunStatus { return ["planned", "running", "paused", "completed", "shutdown", "deleted"].includes(String(value)) ? String(value) as TeamRunStatus : "planned" }
