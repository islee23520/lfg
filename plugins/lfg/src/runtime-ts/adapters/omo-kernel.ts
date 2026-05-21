import { bootstrapState } from "../foundation/state-schema"
import { resolveLfgEnv, type LfgEnv } from "../foundation/env"

export type LfgUlwMessage = { role: "user" | "assistant" | "system" | "tool"; text: string }
export type LfgUlwPromptRequest = { sessionID: string; message: string; agentName?: string; modelID?: string }
export type LfgUlwPromptReceipt = { accepted: boolean; sessionID: string; dispatchID: string }
export type LfgUlwSessionEvent = { type: "idle" | "error" | "deleted" | "compacting" | "completed"; sessionID: string; error?: string }
export type LfgUlwHost = { dispatchedPrompts: LfgUlwPromptRequest[]; dispatchPrompt(request: LfgUlwPromptRequest): Promise<LfgUlwPromptReceipt>; readMessages(sessionID: string): Promise<LfgUlwMessage[]>; readTodos(sessionID: string): Promise<unknown[]>; readStatus(sessionID: string): Promise<string>; abort(sessionID: string): Promise<void>; onEvent(listener: (event: LfgUlwSessionEvent) => void): () => void; emit(event: LfgUlwSessionEvent): void; appendMessage(sessionID: string, message: LfgUlwMessage): void }
export type LfgRunUlwResult = { dispatched: boolean; intents: string[]; receipts: LfgUlwPromptReceipt[] }
export type LfgLoopStateController = { start(input: Record<string, unknown>): void; getState(): unknown; clear(): void }
export type LfgOmoKernel = { env: LfgEnv; host: LfgUlwHost; loopState: LfgLoopStateController; runUlw(input: { sessionID: string; text: string; agentName?: string; modelID?: string }): Promise<LfgRunUlwResult>; runTrackedUlw(input: { sessionID: string; text: string; agentName?: string; modelID?: string; completionPromise?: string }): Promise<LfgRunUlwResult> }

export async function createLfgOmoKernel(env: LfgEnv = resolveLfgEnv()): Promise<LfgOmoKernel> {
  await bootstrapState(env)
  const host = createMemoryLfgUlwHost()
  const loopState = createMemoryLoopStateController()
  return { env, host, loopState, runUlw: (input) => fallbackRunUlw(host, input), runTrackedUlw: async (input) => { const result = await fallbackRunUlw(host, input); if (result.dispatched) loopState.start({ sessionID: input.sessionID, prompt: input.text, completionPromise: input.completionPromise, ultrawork: true }); return result } }
}

export function createMemoryLfgUlwHost(): LfgUlwHost {
  const messagesBySession = new Map<string, LfgUlwMessage[]>()
  const listeners = new Set<(event: LfgUlwSessionEvent) => void>()
  const dispatchedPrompts: LfgUlwPromptRequest[] = []
  return { dispatchedPrompts, async dispatchPrompt(request) { dispatchedPrompts.push(request); appendMessage(messagesBySession, request.sessionID, { role: "user", text: request.message }); return { accepted: true, sessionID: request.sessionID, dispatchID: `lfg-kernel-dispatch-${dispatchedPrompts.length}` } }, async readMessages(sessionID) { return messagesBySession.get(sessionID) ?? [] }, async readTodos() { return [] }, async readStatus() { return "idle" }, async abort() {}, onEvent(listener) { listeners.add(listener); return () => { listeners.delete(listener) } }, emit(event) { for (const listener of listeners) listener(event) }, appendMessage(sessionID, message) { appendMessage(messagesBySession, sessionID, message) } }
}

async function fallbackRunUlw(host: LfgUlwHost, input: { sessionID: string; text: string; agentName?: string; modelID?: string }): Promise<LfgRunUlwResult> {
  if (!/\b(ultrawork|ulw)\b/i.test(input.text.replace(/```[\s\S]*?```/g, "").replace(/`[^`]+`/g, ""))) return { dispatched: false, intents: [], receipts: [] }
  const receipt = await host.dispatchPrompt({ sessionID: input.sessionID, message: "ULTRAWORK MODE ENABLED!", agentName: input.agentName, modelID: input.modelID })
  return { dispatched: receipt.accepted, intents: ["ultrawork"], receipts: [receipt] }
}

function createMemoryLoopStateController(): LfgLoopStateController {
  let state: unknown = null
  return { start(input) { state = { active: true, ...input } }, getState() { return state }, clear() { state = null } }
}

function appendMessage(messagesBySession: Map<string, LfgUlwMessage[]>, sessionID: string, message: LfgUlwMessage): void { messagesBySession.set(sessionID, [...messagesBySession.get(sessionID) ?? [], message]) }
