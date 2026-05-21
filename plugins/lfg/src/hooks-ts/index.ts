import { createHash } from "crypto"
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, appendFileSync, linkSync, unlinkSync } from "fs"
import { dirname, isAbsolute, join, relative, resolve } from "path"

export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[]
export type JsonObject = { [key: string]: JsonValue | undefined }
export type HookEvent = "SessionStart" | "UserPromptSubmit" | "PreToolUse" | "PostToolUse" | "PostToolUseFailure" | "PreCompact" | "Stop" | "SessionEnd" | "Notification" | string
export type HookSnapshot = JsonObject & { ultragoal?: JsonObject | null; active_runs?: JsonObject[]; boulder?: JsonObject; has_durable_goal?: boolean; current_agent?: string; timestamp?: string }
export type HookHandler<I, O> = (input: I) => O | Promise<O>
export type SafeHook<I, O> = (input: I) => Promise<{ ok: true; output: O } | { ok: false; status: "fail_open"; error: string }>

const SAFE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/
const TERMINAL_STATUSES = new Set(["dispatched", "manual_gate_required", "cancelled", "failed"])

export const HOOK_TIERS: Record<number, JsonObject> = {
  1: { name: "Session", description: "Session lifecycle hooks: start/end, notification, initial state snapshot and audit logging.", modules: ["paths", "state_io", "snapshot", "run_discovery", "payload", "bridge_runtime"], events: ["SessionStart", "SessionEnd", "Notification"], omo_origin: "Session tier (lifecycle + audit)" },
  2: { name: "Tool Guard", description: "Pre/post tool guards, failure handling, ambiguity detection, and dispatch validation.", modules: ["dispatch_gate", "ambiguity_gate", "task_helpers"], events: ["PreToolUse", "PostToolUse", "PostToolUseFailure"], omo_origin: "Tool Guard tier (safety + eligibility)" },
  3: { name: "Transform", description: "Prompt/context transformation: aggressive injection, compaction protection, user prompt extraction.", modules: ["injection", "compaction_protection", "payload"], events: ["UserPromptSubmit", "PreCompact"], omo_origin: "Transform tier (context rewriting)" },
  4: { name: "Continuation", description: "TODO continuation reminders, incomplete item tracking, dispatch gate reservation for manual recovery.", modules: ["todo_continuation", "dispatch_gate", "boulder_persistence"], events: ["UserPromptSubmit", "PostToolUse", "Stop", "PreCompact"], omo_origin: "Continuation tier (never-stops enforcement)" },
  5: { name: "Skill", description: "Skill/agent-specific hooks: evidence, task helpers, per-agent behavioral constraints and eligibility.", modules: ["task_helpers", "state_io", "boulder_persistence"], events: ["*"], omo_origin: "Skill tier (agent + skill registration)" },
}

export function safeCreateHook<I, O>(handler: HookHandler<I, O>): SafeHook<I, O> {
  return async (input) => {
    try {
      return { ok: true, output: await handler(input) }
    } catch (error) {
      return { ok: false, status: "fail_open", error: error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200) }
    }
  }
}

export function pluginRoot(): string {
  return process.env.GROK_PLUGIN_ROOT || process.env.CLAUDE_PLUGIN_ROOT || resolve(import.meta.dir, "../..")
}

export function pluginData(): string {
  return process.env.GROK_PLUGIN_DATA || process.env.CLAUDE_PLUGIN_DATA || join(process.cwd(), ".lfg")
}

export function stateDir(): string { return join(pluginData(), "state") }
export function ultragoalDir(): string { return join(pluginData(), "ultragoal") }
export function harnessDir(): string { return join(pluginData(), "harness") }
export function dispatchGateDir(): string { return join(pluginData(), "dispatch-gate") }
export function injectionFile(): string { return join(harnessDir(), "active_injection.txt") }
export function injectionMeta(): string { return join(harnessDir(), "last_turn.json") }
export function todoReminderState(): string { return join(harnessDir(), "todo-continuation.json") }
export function atlasDependencyWaveState(): string { return join(harnessDir(), "atlas-dependency-wave.json") }
export function ralphStateDir(): string { return join(pluginData(), "runs", "ralph") }
export function ralphCurrentPath(): string { return join(stateDir(), "current-ralph.json") }
export function stopGuardState(): string { return join(harnessDir(), "stop-continuation-guard.json") }

export function readJson<T extends JsonValue>(path: string, defaultValue: T): T {
  if (!existsSync(path)) return defaultValue
  try { return JSON.parse(readFileSync(path, "utf8")) as T } catch { return defaultValue }
}

export function writeJson(path: string, value: JsonValue, trailingNewline = true): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value, null, 2)}${trailingNewline ? "\n" : ""}`, "utf8")
}

export function validateSafeId(value: string, field: string): string {
  if (!SAFE_ID_RE.test(value || "")) throw new Error(`invalid ${field}: ${JSON.stringify(value)}`)
  return value
}

export function safeChildPath(root: string, ...parts: string[]): string {
  const rootResolved = resolve(root)
  const path = resolve(rootResolved, ...parts)
  const rel = relative(rootResolved, path)
  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) return path
  throw new Error(`unsafe path outside ${rootResolved}: ${path}`)
}

export function loadCurrentUltragoal(): JsonObject | null {
  const data = readJson<JsonObject>(join(stateDir(), "current-ultragoal.json"), {})
  return typeof data.id === "string" && data.id ? data : null
}

export function boulderPath(ugid: string): string {
  return safeChildPath(ultragoalDir(), validateSafeId(ugid, "ultragoal id"), "boulder.json")
}

export function readBoulder(ugid: string): JsonObject {
  return readJson<JsonObject>(boulderPath(ugid), {})
}

export function writeBoulder(ugid: string, boulder: JsonObject): void {
  writeJson(boulderPath(ugid), { ...boulder, last_updated_by: "sisyphus", last_updated_at: isoNow() })
}

export function taskIsPending(task: JsonObject): boolean {
  return task.status !== "completed" && task.status !== "done"
}

export function messageIsEvidence(message: JsonObject): boolean {
  return ["evidence", "evidence_submission", "submit_evidence", "checkpoint"].includes(String(message.type ?? ""))
}

export function evidenceIdentity(message: JsonObject): string {
  for (const key of ["id", "ts", "timestamp", "created_at", "updated_at"]) {
    const value = message[key]
    if (value) return String(value)
  }
  return stableJson(message).slice(0, 500)
}

export function progressEvidenceFingerprint(snapshot: HookSnapshot): string {
  const parts: string[] = []
  const boulder = asRecord(snapshot.boulder) ?? {}
  const recentEvidence = asArray(boulder.recent_evidence)
  for (const evidence of recentEvidence) {
    if (isRecord(evidence)) parts.push(evidenceIdentity(evidence))
    else if (evidence) parts.push(String(evidence).slice(0, 500))
  }
  for (const run of snapshot.active_runs ?? []) {
    for (const evidence of asArray(run.recent_evidence)) {
      if (isRecord(evidence)) parts.push(evidenceIdentity(evidence))
      else if (evidence) parts.push(String(evidence).slice(0, 500))
    }
  }
  return parts.slice(-10).join("|")
}

export function computeHeuristicAmbiguity(userPrompt: string, _snapshot: HookSnapshot): number {
  if (!userPrompt || userPrompt.trim().length < 8) return 0.85
  const promptLower = userPrompt.toLowerCase()
  if (["implement", "fix", "write", "add", "create the", "next task", "evidence", "checkpoint"].some((signal) => promptLower.includes(signal)) && userPrompt.length > 25) return 0.18
  if (["어떻게", "how should", "뭐", "what do you think", "maybe", "perhaps", "아이디어", "생각", "고민"].some((signal) => promptLower.includes(signal)) && userPrompt.length < 120) return 0.72
  return 0.42
}

export function detectCurrentAgent(userPrompt = ""): string {
  const envAgent = process.env.CURRENT_AGENT || process.env.GROK_AGENT_ID || process.env.AGENT_ID || process.env.LFG_ACTIVE_AGENT
  if (envAgent) return envAgent.toLowerCase().trim()
  const promptLower = userPrompt.toLowerCase()
  for (const agent of ["sisyphus", "hephaestus", "prometheus", "atlas", "sisyphus-junior", "oracle", "librarian", "explore", "metis", "momus", "multimodal-looker", "builtin-agents"]) {
    if (promptLower.includes(agent) || promptLower.includes(`you are ${agent}`) || promptLower.includes(`as ${agent}`)) return agent
  }
  return "sisyphus"
}

export function extractUserPromptFromPayload(raw: string): string {
  try {
    if (!raw) return ""
    const data = raw.trim().startsWith("{") ? JSON.parse(raw) as JsonObject : {}
    for (const key of ["prompt", "user_prompt", "input", "message", "text"]) {
      if (typeof data[key] === "string") return data[key]
    }
    if (raw.length < 4000) return raw.trim()
    return `${raw.slice(0, 2000)} ... [truncated]`
  } catch {
    return ""
  }
}

export function findActiveRuns(): JsonObject[] {
  const runsRoot = join(stateDir(), "runs")
  const currentUgId = loadCurrentUltragoal()?.id
  if (!existsSync(runsRoot)) return []
  const candidates: { runDir: string; runData: JsonObject; name: string; relevance: number; updated: string }[] = []
  for (const name of [...safeReadDir(runsRoot)].sort().reverse()) {
    const teamsDir = join(runsRoot, name, "teams")
    if (!existsSync(teamsDir)) continue
    for (const teamName of safeReadDir(teamsDir)) {
      const teamDir = join(teamsDir, teamName)
      const runData = readJson<JsonObject>(join(teamDir, "run.json"), {})
      if (!Object.keys(runData).length) continue
      const status = String(runData.status ?? "active")
      if (["completed", "aborted", "archived"].includes(status)) continue
      const ulid = runData.ultragoal_id
      candidates.push({ runDir: teamDir, runData, name, relevance: currentUgId && ulid === currentUgId ? 10 : 5, updated: String(runData.updated_at ?? "") })
    }
  }
  candidates.sort((a, b) => b.relevance - a.relevance || b.updated.localeCompare(a.updated))
  return candidates.slice(0, 2).map((candidate) => {
    const tasks = readJson<JsonValue[]>(join(candidate.runDir, "tasks.json"), []).filter(isRecord)
    const mailbox = readJson<JsonValue[]>(join(candidate.runDir, "mailbox.json"), []).filter(isRecord)
    return {
      run_id: candidate.runData.id,
      mode: candidate.runData.mode ?? candidate.name.split("-")[0],
      mode_id: candidate.name,
      objective: candidate.runData.objective ?? "",
      ultragoal_id: candidate.runData.ultragoal_id,
      status: candidate.runData.status ?? "active",
      tasks,
      pending_tasks: tasks.filter(taskIsPending).slice(0, 4),
      recent_evidence: mailbox.filter(messageIsEvidence).slice(-3),
      team_dir: candidate.runDir,
    }
  })
}

export function getGoalSnapshot(): HookSnapshot {
  const ultragoal = loadCurrentUltragoal()
  const activeRuns = findActiveRuns()
  const boulder = ultragoal && typeof ultragoal.id === "string" ? readBoulder(ultragoal.id) : {}
  return { timestamp: isoNow(), ultragoal, active_runs: activeRuns, boulder, has_durable_goal: Boolean(ultragoal || activeRuns.length) }
}

export function persistBoulderFromPayload(rawPayload: string, snapshot: HookSnapshot): HookSnapshot {
  if (!snapshot.has_durable_goal) return snapshot
  const ugid = asRecord(snapshot.ultragoal)?.id
  if (typeof ugid !== "string") return snapshot
  try {
    const match = /```(?:boulder|json)\s*(\{[\s\S]*?\})\s*```/i.exec(rawPayload)
    if (!match) return snapshot
    const parsed = JSON.parse(match[1].trim()) as JsonObject
    if (parsed.ultragoal_id === ugid || parsed.active_work_id === ugid || parsed.plan_id === ugid) {
      if (parsed.schema_version === undefined) parsed.schema_version = 2
      writeBoulder(ugid, parsed)
      return getGoalSnapshot()
    }
  } catch {}
  return snapshot
}

export function incompleteTodoItems(snapshot: HookSnapshot): string[] {
  const items: string[] = []
  const boulder = asRecord(snapshot.boulder) ?? {}
  for (const action of asArray(boulder.next_actions).filter(isRecord)) {
    if (taskIsPending(action)) items.push(`- [ ] ${String(action.goal ?? action.text ?? action.task ?? action.id ?? "pending boulder action")} (${String(action.status ?? "pending")})`)
  }
  for (const run of snapshot.active_runs ?? []) {
    const mode = String(run.mode ?? "run")
    for (const task of asArray(run.pending_tasks).filter(isRecord)) {
      items.push(`- [ ] [${mode}] ${String(task.title ?? task.task ?? task.text ?? task.id ?? "pending task")} (${String(task.status ?? "pending")})`)
    }
  }
  return items.slice(0, 8)
}

export function todoContinuationReminder(snapshot: HookSnapshot, event: string): string {
  if (!["posttooluse", "stop", "precompact", "userpromptsubmit"].includes(event.toLowerCase())) return ""
  const todos = incompleteTodoItems(snapshot)
  if (!todos.length) return ""
  const evidenceFp = progressEvidenceFingerprint(snapshot)
  if (!evidenceFp) return ""
  const pendingFp = todos.join("|")
  const statePath = todoReminderState()
  const state = readJson<JsonObject>(statePath, {})
  if (state.pendingFingerprint === pendingFp && state.evidenceFingerprint === evidenceFp) return ""
  try { writeJson(statePath, { event, timestamp: isoNow(), pendingFingerprint: pendingFp, evidenceFingerprint: evidenceFp, todoCount: todos.length }) } catch { return "" }
  return `[SYSTEM REMINDER - TODO CONTINUATION]\n\nYou have incomplete todos and new progress evidence. Complete ALL before responding as finished:\n${todos.join("\n")}\n\nDo not claim completion until every todo is completed and backed by concrete evidenceArtifactPaths.\nThis reminder is bounded: it only reappears after new progress evidence changes.`
}

export function atlasDependencyWaveItems(snapshot: HookSnapshot): string[] {
  if (String(snapshot.current_agent ?? "").toLowerCase() !== "atlas") return []
  const items: string[] = []
  for (const run of snapshot.active_runs ?? []) {
    const tasks = asArray(run.tasks).filter(isRecord)
    const done = new Set(tasks.filter((task) => !taskIsPending(task)).map(taskId))
    const ready: string[] = []
    const blocked: string[] = []
    for (const task of tasks) {
      if (!taskIsPending(task)) continue
      const missing = taskDependencies(task).filter((dep) => !done.has(dep))
      const label = `${taskId(task)}: ${taskLabel(task)}`
      if (missing.length) blocked.push(`blocked ${label} (waiting on ${missing.join(", ")})`)
      else ready.push(`ready ${label}`)
    }
    if (ready.length || blocked.length) items.push(`[${String(run.mode ?? "run")}] ${[...ready, ...blocked].slice(0, 5).join("; ")}`)
  }
  for (const action of asArray(asRecord(snapshot.boulder)?.next_actions).filter(isRecord).filter((action) => String(action.owner ?? "").toLowerCase() === "atlas" && taskIsPending(action)).slice(0, 3)) {
    const deps = taskDependencies(action)
    items.push(`[boulder] ready ${taskId(action)}: ${taskLabel(action)} (${String(action.status ?? "pending")};${deps.length ? ` deps=${deps.join(", ")}` : " no deps"})`)
  }
  return items.slice(0, 8)
}

export function atlasDependencyWaveReminder(snapshot: HookSnapshot, event: string): string {
  if (!["posttooluse", "stop", "precompact", "userpromptsubmit"].includes(event.toLowerCase())) return ""
  const items = atlasDependencyWaveItems(snapshot)
  if (!items.length) return ""
  const evidenceFp = progressEvidenceFingerprint(snapshot) || "atlas-wave:no-evidence-yet"
  const pendingFp = items.join("|")
  const statePath = atlasDependencyWaveState()
  const state = readJson<JsonObject>(statePath, {})
  if (state.pendingFingerprint === pendingFp && state.evidenceFingerprint === evidenceFp) return ""
  try { writeJson(statePath, { event, timestamp: isoNow(), pendingFingerprint: pendingFp, evidenceFingerprint: evidenceFp, waveItemCount: items.length }) } catch { return "" }
  return `[SYSTEM REMINDER - ATLAS DEPENDENCY WAVE]\n\nYou are Atlas and dependency-wave work is still open. Execute only unblocked ready items, keep blocked items blocked,\nupdate checkboxes with evidence, and do not mark the wave complete until every ready item is verified:\n${items.map((item) => `- ${item}`).join("\n")}\n\nThis reminder is bounded by the dependency-wave fingerprint.`
}

export function activeRalphLoops(): JsonObject[] {
  const current = readJson<JsonObject>(ralphCurrentPath(), {})
  const rid = current.id
  if (typeof rid !== "string" || !rid) return []
  const record = readJson<JsonObject>(join(ralphStateDir(), `${rid}.json`), {})
  if (!["active", "running", undefined].includes(record.status as string | undefined)) return []
  return [{ id: rid, objective: record.objective ?? "ralph objective", iteration: record.iteration ?? 0, maxIterations: record.maxIterations ?? 0, status: record.status ?? "active" }].slice(0, 3)
}

export function ralphContinuationReminder(snapshot: HookSnapshot, event: string): string {
  if (!["posttooluse", "stop", "precompact", "userpromptsubmit"].includes(event.toLowerCase())) return ""
  const ralphs = activeRalphLoops()
  if (!ralphs.length) return ""
  const evidenceFp = progressEvidenceFingerprint(snapshot)
  if (!evidenceFp) return ""
  const first = ralphs[0]
  const pendingFp = `${String(first.id)}:${String(first.iteration)}`
  const statePath = join(dirname(ralphCurrentPath()), "ralph-continuation.json")
  const state = readJson<JsonObject>(statePath, {})
  if (state.pendingFingerprint === pendingFp && state.evidenceFingerprint === evidenceFp) return ""
  try { writeJson(statePath, { event, timestamp: isoNow(), pendingFingerprint: pendingFp, evidenceFingerprint: evidenceFp, ralphCount: ralphs.length }) } catch { return "" }
  const lines = ralphs.map((ralph) => `- [ ] Ralph ${String(ralph.id)}: ${String(ralph.objective)} (iter ${String(ralph.iteration)}/${String(ralph.maxIterations)}, ${String(ralph.status)})`)
  return `[SYSTEM REMINDER - RALPH LOOP CONTINUATION]\n\nActive Ralph persistence loop(s) detected. Continue iterating until stop condition or max iterations:\n${lines.join("\n")}\n\nDo not stop the loop prematurely. Verify each step with evidence before advancing or claiming done.\nThis reminder is bounded: it only reappears after new progress evidence changes.`
}

export function shouldGuardStop(snapshot: HookSnapshot, event: string): boolean {
  if (event.toLowerCase() !== "stop") return false
  const todos = incompleteTodoItems(snapshot)
  const ralphs = activeRalphLoops()
  const boulder = asRecord(snapshot.boulder) ?? {}
  return Boolean(todos.length || ralphs.length || boulder.next_actions || boulder.goal)
}

export function stopContinuationGuard(snapshot: HookSnapshot, event: string): string {
  if (!shouldGuardStop(snapshot, event)) return ""
  const evidenceFp = progressEvidenceFingerprint(snapshot)
  if (!evidenceFp) return ""
  const todos = incompleteTodoItems(snapshot)
  const ralphs = activeRalphLoops()
  const statePath = stopGuardState()
  const state = readJson<JsonObject>(statePath, {})
  const pendingFp = `todos:${todos.length}|ralph:${ralphs.length}`
  if (state.pendingFingerprint === pendingFp && state.evidenceFingerprint === evidenceFp) return ""
  try { writeJson(statePath, { event, timestamp: isoNow(), pendingFingerprint: pendingFp, evidenceFingerprint: evidenceFp, guarded: true }) } catch { return "" }
  const guardLines: string[] = []
  if (todos.length) guardLines.push("Incomplete todos remain - complete them before stopping.")
  if (ralphs.length) guardLines.push("Active Ralph loop(s) in progress - do not terminate the persistence loop.")
  if (!todos.length && !ralphs.length) guardLines.push("Active Boulder with pending work - verify completion evidence first.")
  return `[SYSTEM REMINDER - STOP CONTINUATION GUARD]\n\nSTOP event detected while durable work is active.\n${guardLines.join("\n")}\n\nDo NOT claim session complete or allow stop until all pending items have concrete evidenceArtifactPaths and status=complete.\nThis guard enforces OMO-style never-stops persistence for continuation hooks.`
}

export function buildCompactionProtectionInjection(snapshot: HookSnapshot, event: string): string {
  const ug = asRecord(snapshot.ultragoal) ?? {}
  const runs = snapshot.active_runs ?? []
  const ugId = String(ug.id ?? "none")
  const ugObj = String(ug.objective ?? "no active ultragoal")
  const summaryLines = runs.map((run) => `- [${String(run.mode ?? "?")}] ${String(run.objective ?? "").slice(0, 100)}`)
  const currentBoulder = snapshot.boulder && Object.keys(snapshot.boulder).length ? JSON.stringify(snapshot.boulder, null, 2) : "No boulder file loaded."
  return `=== LFG ACTIVE GOAL HARNESS — PRE-COMPACT BOULDER HANDOFF (DIRECTION A) ===\nEVENT: ${event}\n\n⚠️  CONTEXT COMPACTION IS ABOUT TO HAPPEN (≥70% usage).\n\nUnder Direction A, the harness's #1 priority is to make sure the boulder survives.\n\nCURRENT DURABLE GOAL:\nUltragoal: ${ugId}\nObjective: ${ugObj}\n\nCanonical Roles (OmO lineage):\n- sisyphus: The one who must keep the boulder alive.\n- hephaestus: The forger executing deep work.\n- oracle: The read-only advisor.\n\nCurrent Boulder on disk right now:\n${currentBoulder}\n\nActive Protected Work:\n${summaryLines.length ? summaryLines.join("\n") : "- No active runs detected. Protect whatever ledger exists."}\n\n=== MANDATORY BOULDER HANDOFF PROTOCOL (BEFORE COMPACTION) ===\n\n1. **Full Updated Boulder Export** (Required)\n   You must output a complete, fresh boulder JSON in the exact schema.\n   This file will be the only thing the next Sisyphus has.\n\n2. **Sisyphus Handoff Note** (Required)\n   After the boulder JSON, write a short but precise handoff:\n   - Current physical location of the boulder (which ultragoal / which hyperplan)\n   - The single highest priority next_action right now\n   - The one thing that must not be lost no matter what\n\n3. **Strong Recommendation**\n   Call \`ulw ultragoal checkpoint --status "compaction-protection"\` and attach both the full boulder and the handoff note as evidence.\n\n4. **Mindset**\n   You are Sisyphus. If you are casual here, the boulder dies. Treat this as a life-or-death handoff.\n\nThis is Direction A. The boulder must live.\n\n=== END PRE-COMPACT HANDOFF INJECTION ===`
}

export function buildAggressiveInjection(snapshot: HookSnapshot, userPrompt: string, event: string): string {
  if (event.toLowerCase() === "precompact") return buildCompactionProtectionInjection(snapshot, event)
  const ug = asRecord(snapshot.ultragoal) ?? {}
  const runs = snapshot.active_runs ?? []
  const protectionLines: string[] = []
  const pendingTasks: string[] = []
  for (const run of runs.slice(0, 2)) {
    const mode = String(run.mode ?? "?")
    for (const task of asArray(run.tasks).filter(isRecord).filter(taskIsPending).slice(0, 3)) pendingTasks.push(`[${mode}] ${String(task.title ?? task.id)}`)
    protectionLines.push(`- ${mode.toUpperCase()} run ${String(run.run_id)}: ${String(run.objective ?? "").slice(0, 120)}`)
  }
  if (!protectionLines.length) protectionLines.push("- No active separated run detected, but ultragoal ledger is alive.")
  computeHeuristicAmbiguity(userPrompt, snapshot)
  const continuationBlock = [todoContinuationReminder(snapshot, event), atlasDependencyWaveReminder(snapshot, event), ralphContinuationReminder(snapshot, event), stopContinuationGuard(snapshot, event)].filter(Boolean).map((block) => `${block}\n`).join("\n")
  const agentId = String(snapshot.current_agent ?? "sisyphus")
  const boulderText = snapshot.boulder && Object.keys(snapshot.boulder).length ? JSON.stringify(snapshot.boulder, null, 2) : "No boulder file found yet. You must create one now."
  return `${continuationBlock}${buildAgentHeader(agentId)}\n=== LFG ACTIVE GOAL HARNESS — OMO AGENT PROTOCOL ===\nThis block is produced by the harness. It is MANDATORY.\nCurrent agent: ${agentId.toUpperCase()}\n\n\n=== BOULDER STATE (Single Source of Truth) ===\nYou MUST treat the following as your official boulder memory (like boulder.json in real OmO).\nYou are required to read it at the start of your turn and update it before the turn ends.\n\nCurrent Boulder:\n{\n  "ultragoal_id": "${String(ug.id ?? "none")}",\n  "objective": "${String(ug.objective ?? "no active ultragoal")}",\n  "active_work": [\n${protectionLines.map((line) => `    ${line}`).join("\n")}\n  ],\n  "pending_next_actions": [\n${pendingTasks.length ? pendingTasks.map((line) => `    ${line}`).join("\n") : "    - No explicit pending actions"}\n  ]\n}\n\nUSER INPUT THIS TURN:\n${userPrompt ? userPrompt.slice(0, 900) : "(no input)"}\n\n=== OFFICIAL BOULDER (YOU MUST MAINTAIN THIS) ===\nThis is your single source of truth. You are Sisyphus — you are REQUIRED to keep this boulder accurate and up-to-date every single turn.\n\nCurrent Boulder (loaded from disk):\n${boulderText}\n\n=== SISYPHUS MANDATORY BOULDER PROTOCOL (Direction A) ===\n\nYou MUST do the following every turn:\n\n1. Read the boulder above as your living memory.\n2. Perform your normal Sisyphus work (intent classification, delegation, specialist consultation, coordination, etc.).\n3. **At the very end of your response** (after all reasoning, decisions, and delegation), you MUST output the updated boulder in the exact format below.\n\nThe boulder block **must be the last thing you output** in this turn, wrapped exactly like this:\n\n\`\`\`boulder\n{\n  "version": 1,\n  "ultragoal_id": "...",\n  "last_updated_by": "sisyphus",\n  "last_updated_at": "current ISO time",\n  "current_objective": "...",\n  "status_summary": "...",\n  "boulder_position": { "progress": 0-100, "phase": "..." },\n  "open_questions": [...],\n  "blockers": [...],\n  "next_actions": [\n    {\n      "id": "NA-xx",\n      "owner": "atlas | hephaestus | sisyphus",\n      "goal": "high-level goal (not a recipe)",\n      "success_criteria": "what must be proven with evidence",\n      "status": "pending | in_progress | done"\n    }\n  ],\n  "recent_evidence": [...],\n  "sisyphus_notes": "..."\n}\n\`\`\`\n\nIf you do not output a valid \`\`\`boulder block at the very end, the boulder is considered not updated this turn. This is non-negotiable under Direction A.\n\n=== MANDATORY MINDSET (Direction A — Sisyphus Protocol) ===\n- The boulder only exists because you actively maintain it.\n- If you do not update the boulder this turn, the next Sisyphus (future you) will be blind.\n- On PreCompact or when context is about to be lost, you must produce a complete, self-contained boulder so the labor can continue.\n- Weak summaries and "I think it's fine" are forbidden. Be brutally precise.\n\n=== END SISYPHUS PROTOCOL ===\n\nYou are now operating as Sisyphus under LFG harness control.\nThe protocol above overrides normal "helpful assistant" behavior.`.trim()
}

export function reserveContinuationDispatch(injection: string, snapshot: HookSnapshot, event: string): JsonObject {
  try {
    const ultragoal = asRecord(snapshot.ultragoal) ?? {}
    const boulder = asRecord(snapshot.boulder) ?? {}
    const evidenceHash = createHash("sha256").update(progressEvidenceFingerprint(snapshot)).digest("hex").slice(0, 12)
    return reserveDispatchGate({ dispatchRoot: dispatchGateDir(), sessionId: process.env.GROK_SESSION_ID || process.env.OPENCODE_SESSION_ID || process.env.CLAUDE_SESSION_ID || "hook-session", planId: String(ultragoal.id ?? "no-active-ultragoal"), boulderVersion: String(boulder.schema_version ?? boulder.schemaVersion ?? boulder.version ?? 1), reason: `hook:${event}:${evidenceHash}`, targetAgent: "sisyphus", prompt: injection, stateSnapshot: { event, ultragoalId: ultragoal.id, hasDurableGoal: Boolean(snapshot.has_durable_goal), todoContinuationReminder: injection.includes("[SYSTEM REMINDER - TODO CONTINUATION]"), pendingItems: incompleteTodoItems(snapshot) }, nativeDispatchSupported: false, nowValue: isoNow() })
  } catch (error) {
    return { ok: false, status: "manual_gate_unavailable", error: error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200) }
  }
}

export function reserveDispatchGate(input: { dispatchRoot: string; sessionId: string; planId: string; boulderVersion: string; reason: string; targetAgent: string; prompt: string; stateSnapshot: JsonObject; nativeDispatchSupported: boolean; nowValue: string }): JsonObject {
  const key = dispatchKey(input)
  mkdirSync(input.dispatchRoot, { recursive: true })
  const path = join(input.dispatchRoot, `${key}.json`)
  const existing = readJson<JsonObject>(path, {})
  if (Object.keys(existing).length) return dispatchResponse(existing, path, key, true)
  const status = input.nativeDispatchSupported ? "dispatched" : "manual_gate_required"
  const record: JsonObject = { schemaVersion: 1, kind: "lfg-continuation-dispatch-gate", dispatchKey: key, status, dispatch: status, sessionId: input.sessionId, planId: input.planId, boulderVersion: input.boulderVersion, reason: input.reason, targetAgent: input.targetAgent, prompt: input.prompt, stateSnapshot: input.stateSnapshot, nativeDispatchSupported: input.nativeDispatchSupported, manualGateRequired: !input.nativeDispatchSupported, createdAt: input.nowValue, updatedAt: input.nowValue, terminal: TERMINAL_STATUSES.has(status), evidence: ["continuation-gate=ok"] }
  const tmpPath = join(input.dispatchRoot, `.${key}.${process.pid}.${Date.now()}.tmp`)
  writeFileSync(tmpPath, `${stableJson(record)}\n`, "utf8")
  try { linkSync(tmpPath, path) } catch { return dispatchResponse(readJson<JsonObject>(path, {}), path, key, true) } finally { try { unlinkSync(tmpPath) } catch {} }
  return dispatchResponse(record, path, key, false)
}

export function dispatchKey(input: { sessionId: string; planId: string; boulderVersion: string; reason: string; targetAgent: string }): string {
  return `dispatch-${createHash("sha256").update([input.sessionId, input.planId, input.boulderVersion, input.reason, input.targetAgent].join("\x1f")).digest("hex").slice(0, 24)}`
}

export function writeInjectionArtifacts(injection: string, meta: JsonObject): void {
  try {
    mkdirSync(harnessDir(), { recursive: true })
    writeFileSync(injectionFile(), `${injection}\n`, "utf8")
    writeFileSync(injectionMeta(), JSON.stringify(meta, null, 2), "utf8")
  } catch {}
}

export function runGoalHarness(rawPayload: string, event = process.env.GROK_HOOK_EVENT || process.env.CLAUDE_HOOK_EVENT || "unknown"): { code: number; stdout: string; meta?: JsonObject } {
  process.env.LFG_LAUNCHER = process.env.LFG_LAUNCHER || "lfg"
  let snapshot = getGoalSnapshot()
  const userPrompt = extractUserPromptFromPayload(rawPayload)
  snapshot.current_agent = detectCurrentAgent(userPrompt)
  snapshot = persistBoulderFromPayload(rawPayload, snapshot)
  if (!snapshot.has_durable_goal) return { code: 0, stdout: "" }
  const injection = buildAggressiveInjection(snapshot, userPrompt, event)
  const dispatchGate = reserveContinuationDispatch(injection, snapshot, event)
  const meta: JsonObject = { event, timestamp: snapshot.timestamp, has_durable_goal: true, ultragoal_id: asRecord(snapshot.ultragoal)?.id, current_agent: snapshot.current_agent, num_active_runs: snapshot.active_runs?.length ?? 0, boulder_auto_persisted_this_turn: Boolean(snapshot.boulder && Object.keys(snapshot.boulder).length), todo_continuation_reminder: injection.includes("[SYSTEM REMINDER - TODO CONTINUATION]"), atlas_dependency_wave_reminder: injection.includes("[SYSTEM REMINDER - ATLAS DEPENDENCY WAVE]"), ralph_continuation_reminder: injection.includes("[SYSTEM REMINDER - RALPH LOOP CONTINUATION]"), stop_continuation_guard: injection.includes("[SYSTEM REMINDER - STOP CONTINUATION GUARD]"), continuation_dispatch_gate: dispatchGate, recovery_hooks: ["todo-continuation", "ralph-loop", "stop-continuation-guard", "prometheus-markdown-only", "start-work-resumption", "provider-fallback-manual-gate", "evidence-recovery", "state-resumption", "agent-specific-behavior", "atlas-dependency-wave"] }
  writeInjectionArtifacts(injection, meta)
  return { code: 0, stdout: `${injection}\n\n`, meta }
}

export function runAuditHook(rawPayload: string, event = process.env.GROK_HOOK_EVENT || process.env.CLAUDE_HOOK_EVENT || "unknown"): number {
  try {
    const logFile = join(pluginData(), "events", "audit.jsonl")
    const payload = rawPayload.replace(/(xai-|sk-|gh[pousr]_|github_pat_)[A-Za-z0-9_-]+/g, "[REDACTED]")
    mkdirSync(dirname(logFile), { recursive: true })
    appendFileSync(logFile, `${stableJson({ event, payloadBytes: payload.length, payloadPreview: payload.slice(0, 1000), pluginRoot: pluginRoot(), ts: isoNow() })}\n`, "utf8")
  } catch {}
  return 0
}

export function listHookTiers(): JsonObject[] { return Object.entries(HOOK_TIERS).map(([tier, data]) => ({ tier: Number(tier), ...data })).sort((a, b) => Number(a.tier) - Number(b.tier)) }
export function getTierModules(tier: number): string[] { return asArray(HOOK_TIERS[tier]?.modules).map(String) }
export function getTierForEvent(event: string): number[] { return Object.entries(HOOK_TIERS).filter(([, data]) => asArray(data.events).includes(event) || asArray(data.events).includes("*")).map(([tier]) => Number(tier)).sort((a, b) => a - b) }
export function getTierName(tier: number): string { return String(HOOK_TIERS[tier]?.name ?? `Tier ${tier}`) }
export function getOmoOrigin(tier: number): string { return String(HOOK_TIERS[tier]?.omo_origin ?? "unknown") }

function buildAgentHeader(agentId: string): string {
  const agent = agentId.toLowerCase()
  if (agent === "hephaestus") return "=== HEPHAESTUS DEEP WORK PROTOCOL (OMo) ===\nYou are Hephaestus. Autonomous deep specialist. Receive goals not recipes. Enforce GPT-style model family. Block cheap/utility overrides. Produce evidence-rich implementation with verification.\n"
  if (agent === "prometheus") return "=== PROMETHEUS PLAN-ONLY PROTOCOL (OMo) ===\nYou are Prometheus. Strategic planner only. Interview, clarify, produce verifiable plan. Hard-reject any implementation or code changes. Output plan.md + checklist only.\n"
  if (agent === "atlas") return "=== ATLAS TODO-WAVE PROTOCOL (OMo) ===\nYou are Atlas. Execute dependency waves from plan. Update checkboxes with evidence. Verify every step. Continue until checklist complete. Never skip verification.\n"
  if (agent === "sisyphus-junior") return "=== SISYPHUS-JUNIOR BOUNDED EXECUTOR PROTOCOL (OMo) ===\nYou are Sisyphus-Junior. Bounded category task executor. Execute assigned scope only. Verify own changes. Do not orchestrate or spawn other agents. Stay within category limits.\n"
  if (agent === "sisyphus") return "=== SISYPHUS ORCHESTRATOR PROTOCOL (OMo) ===\nYou are Sisyphus. Main orchestrator. Own intent, delegate to specialists, track Boulder, enforce verification. Persist progress. Never stop until done.\n"
  return `=== ${agent.toUpperCase()} AGENT PROTOCOL (OMo) ===\nYou are ${agent}. Follow role constraints from agent registry. Enforce teamEligibility and blockedTools.\n`
}

function dispatchResponse(record: JsonObject, path: string, key: string, duplicate: boolean): JsonObject {
  return { ok: true, decision: duplicate ? "duplicate_suppressed" : "continue", dispatch: record.dispatch ?? record.status, status: record.status, dispatchKey: key, artifactPath: path, duplicateSuppressed: duplicate, terminal: TERMINAL_STATUSES.has(String(record.status)), manualGateRequired: Boolean(record.manualGateRequired), nativeDispatchSupported: Boolean(record.nativeDispatchSupported), prompt: record.prompt ?? "", stateSnapshot: record.stateSnapshot ?? {}, evidence: asArray(record.evidence).length ? asArray(record.evidence) : ["continuation-gate=ok"] }
}

function taskId(task: JsonObject): string { return String(task.id ?? task.taskId ?? task.task_id ?? task.title ?? "task") }
function taskLabel(task: JsonObject): string { return String(task.title ?? task.goal ?? task.task ?? task.text ?? taskId(task)) }
function taskDependencies(task: JsonObject): string[] {
  const deps = task.depends_on ?? task.dependsOn ?? task.dependencies ?? []
  if (typeof deps === "string") return deps.replace(/,/g, ";").split(";").map((item) => item.trim()).filter(Boolean)
  return Array.isArray(deps) ? deps.map(String).filter((item) => item.trim()) : []
}

function safeReadDir(path: string): string[] { try { return readdirSync(path, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name) } catch { return [] } }
function isoNow(): string { return new Date().toISOString().replace(/\.\d{3}Z$/, "Z") }
function asArray(value: JsonValue | undefined): JsonValue[] { return Array.isArray(value) ? value : [] }
function asRecord(value: JsonValue | undefined | null): JsonObject | null { return isRecord(value) ? value : null }
function isRecord(value: unknown): value is JsonObject { return typeof value === "object" && value !== null && !Array.isArray(value) }
function stableJson(value: JsonValue): string { return JSON.stringify(sortJson(value), null, 2) }
function sortJson(value: JsonValue): JsonValue { if (Array.isArray(value)) return value.map(sortJson); if (!isRecord(value)) return value; return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, item === undefined ? null : sortJson(item)])) }
