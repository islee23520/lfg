import { mkdir } from "node:fs/promises"
import type { UlwHost, UlwMessage, UlwPromptRequest, UlwSessionEvent } from "@oh-my-opencode/ulw-host-contract"
import { runTrackedUlw } from "@oh-my-opencode/ulw-kernel"
import { createMemoryUlwLoopStateStore, createUlwLoopStateController, type UlwLoopState } from "@oh-my-opencode/ulw-loop-state"
import { commandEnv, flagString, parseArgs, readJsonRecord, stateFile, utcNow, writeJson, type CommandContext, type JsonRecord } from "./common"

export type UltraworkStatus = "accepted" | "running" | "manual_stop" | "stopped" | "missing"

type UltraworkSession = {
  id: string
  objective: string
  status: UltraworkStatus
  created_at: string
  updated_at: string
  evidence: string
  dispatched: boolean
  intents: string[]
  receipts: JsonRecord[]
  loopState: JsonRecord | null
}

export async function ultraworkCommand(argv: string[], context: CommandContext = {}): Promise<JsonRecord> {
  const subcommand = argv[0] ?? "status"
  if (subcommand === "create") return ultraworkCreateCommand(argv.slice(1), context)
  if (subcommand === "status") return ultraworkStatusCommand(argv.slice(1), context)
  if (subcommand === "stop") return ultraworkStopCommand(argv.slice(1), context)
  return { ok: false, command: "ultrawork", subcommand, error: `unknown ultrawork command: ${subcommand}` }
}

export async function ultraworkCreateCommand(argv: string[], context: CommandContext = {}): Promise<JsonRecord> {
  const parsed = parseArgs(argv)
  const objective = parsed.positional[0]
  const id = flagString(parsed, "id")
  if (!objective || !id) return { ok: false, command: "ultrawork create", error: "usage: ultrawork create <objective> --id <id>" }
  const host = createCommandUlwHost()
  const loopState = createUlwLoopStateController(createMemoryUlwLoopStateStore())
  const result = await runTrackedUlw({ host, loopState, sessionID: id, text: `ulw ${objective}` })
  const now = utcNow(context.now)
  const session: UltraworkSession = {
    id,
    objective,
    status: result.dispatched ? "accepted" : "running",
    created_at: now,
    updated_at: now,
    evidence: result.dispatched ? "ultrawork-accepted=ok" : "ultrawork-created=ok",
    dispatched: result.dispatched,
    intents: result.intents,
    receipts: result.receipts.map((receipt) => ({ accepted: receipt.accepted, sessionID: receipt.sessionID, dispatchID: receipt.dispatchID })),
    loopState: serializeLoopState(loopState.getState()),
  }
  await saveSession(session, context)
  return sessionResponse("ultrawork create", session)
}

export async function ultraworkStatusCommand(argv: string[], context: CommandContext = {}): Promise<JsonRecord> {
  const id = flagString(parseArgs(argv), "id")
  if (!id) return { ok: false, command: "ultrawork status", error: "usage: ultrawork status --id <id>" }
  const session = await loadSession(id, context)
  if (!session) return { ok: false, command: "ultrawork status", id, status: "missing", error: `ultrawork session not found: ${id}` }
  return sessionResponse("ultrawork status", session)
}

export async function ultraworkStopCommand(argv: string[], context: CommandContext = {}): Promise<JsonRecord> {
  const id = flagString(parseArgs(argv), "id")
  if (!id) return { ok: false, command: "ultrawork stop", error: "usage: ultrawork stop --id <id>" }
  const session = await loadSession(id, context)
  if (!session) return { ok: false, command: "ultrawork stop", id, status: "missing", error: `ultrawork session not found: ${id}` }
  const updated: UltraworkSession = { ...session, status: "manual_stop", updated_at: utcNow(context.now), evidence: "ultrawork-manual-stop=ok", loopState: null }
  await saveSession(updated, context)
  return sessionResponse("ultrawork stop", updated)
}

function createCommandUlwHost(): UlwHost {
  const messages = new Map<string, UlwMessage[]>()
  const listeners = new Set<(event: UlwSessionEvent) => void>()
  const requests: UlwPromptRequest[] = []
  return {
    async dispatchPrompt(request) {
      requests.push(request)
      messages.set(request.sessionID, [...messages.get(request.sessionID) ?? [], { role: "user", text: request.message }])
      return { accepted: true, sessionID: request.sessionID, dispatchID: `ulw-command-dispatch-${requests.length}` }
    },
    async readMessages(sessionID) {
      return messages.get(sessionID) ?? []
    },
    async readTodos() {
      return []
    },
    async readStatus() {
      return "idle"
    },
    async abort() {},
    onEvent(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
}

async function saveSession(session: UltraworkSession, context: CommandContext): Promise<void> {
  const env = commandEnv(context)
  await mkdir(env.stateDir, { recursive: true })
  await writeJson(stateFile(env, "ultrawork", session.id), sessionResponse("ultrawork session", session))
}

async function loadSession(id: string, context: CommandContext): Promise<UltraworkSession | null> {
  const record = await readJsonRecord(stateFile(commandEnv(context), "ultrawork", id))
  if (!record) return null
  const objective = typeof record.objective === "string" ? record.objective : ""
  const status = toStatus(record.status)
  return {
    id: typeof record.id === "string" ? record.id : id,
    objective,
    status,
    created_at: typeof record.created_at === "string" ? record.created_at : "",
    updated_at: typeof record.updated_at === "string" ? record.updated_at : "",
    evidence: typeof record.evidence === "string" ? record.evidence : "",
    dispatched: record.dispatched === true,
    intents: Array.isArray(record.intents) ? record.intents.filter((item): item is string => typeof item === "string") : [],
    receipts: Array.isArray(record.receipts) ? record.receipts.filter((item): item is JsonRecord => typeof item === "object" && item !== null && !Array.isArray(item)) : [],
    loopState: typeof record.loopState === "object" && record.loopState !== null && !Array.isArray(record.loopState) ? record.loopState : null,
  }
}

function sessionResponse(command: string, session: UltraworkSession): JsonRecord {
  return {
    ok: true,
    command,
    id: session.id,
    objective: session.objective,
    status: session.status,
    created_at: session.created_at,
    updated_at: session.updated_at,
    evidence: session.evidence,
    dispatched: session.dispatched,
    intents: session.intents,
    receipts: session.receipts,
    loopState: session.loopState,
  }
}

function serializeLoopState(state: UlwLoopState | null): JsonRecord | null {
  if (!state) return null
  return {
    active: state.active,
    iteration: state.iteration,
    maxIterations: state.maxIterations,
    completionPromise: state.completionPromise,
    initialCompletionPromise: state.initialCompletionPromise,
    startedAt: state.startedAt,
    prompt: state.prompt,
    sessionID: state.sessionID,
    strategy: state.strategy,
    ultrawork: state.ultrawork === true,
  }
}

function toStatus(value: unknown): UltraworkStatus {
  return value === "accepted" || value === "running" || value === "manual_stop" || value === "stopped" ? value : "missing"
}
