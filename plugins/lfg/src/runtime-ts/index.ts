import { buildContinuationPrompt as buildOmoContinuationPrompt, createUlwLoopEngine, runTrackedUlw } from "@oh-my-opencode/ulw-kernel"
// @ts-ignore Current linked package exposes these runtime exports through its bundled JS entry without bundled declarations.
import { createMemoryUlwLoopStateStore, createUlwLoopStateController } from "@oh-my-opencode/ulw-loop-state"
import { detectUlwIntent as detectOmoUlwIntent } from "@oh-my-opencode/ulw-intent"
export { removeCode } from "@oh-my-opencode/ulw-intent"

export type LfgTsMessage = {
  role: "user" | "assistant" | "system" | "tool"
  text: string
}

export type LfgTsPromptRequest = {
  sessionID: string
  message: string
  agentName?: string
  modelID?: string
}

export type LfgTsPromptReceipt = {
  accepted: boolean
  sessionID: string
  dispatchID: string
}

type UlwMessage = LfgTsMessage
type UlwPromptRequest = LfgTsPromptRequest
type UlwSessionEvent = { type: "idle"; sessionID: string }
type UlwHost = { dispatchPrompt(request: UlwPromptRequest): Promise<LfgTsPromptReceipt>; readMessages(sessionID: string): Promise<UlwMessage[]>; readTodos(): Promise<unknown[]>; readStatus(): Promise<string>; abort(): Promise<void>; onEvent(listener: (event: UlwSessionEvent) => void): () => void }

export type LfgTsLoopState = {
  active: boolean
  iteration: number
  maxIterations: number
  completionPromise: string
  initialCompletionPromise: string
  prompt: string
  sessionID: string
  ultrawork: boolean
  verificationPending?: boolean
}

export type LfgTsRuntime = {
  readonly dispatchedPrompts: LfgTsPromptRequest[]
  submitUserMessage(input: { sessionID: string; text: string }): Promise<void>
  appendAssistantMessage(sessionID: string, text: string): void
  emitIdle(sessionID: string): Promise<void>
  readMessages(sessionID: string): LfgTsMessage[]
  state(): LfgTsLoopState | null
}

export function detectUlwIntent(text: string): boolean {
  return detectOmoUlwIntent(text).some((intent) => intent.type === "ultrawork" || intent.type === "hyperplan-ultrawork")
}

export function buildContinuationPrompt(state: LfgTsLoopState): string {
  return buildOmoContinuationPrompt({ ...state, startedAt: "", strategy: "continue" })
}

export function createLfgTypescriptRuntime(): LfgTsRuntime {
  const runtime = createKernelBackedRuntime()

  return {
    dispatchedPrompts: runtime.dispatchedPrompts,
    async submitUserMessage(input) {
      await runtime.submitUserMessage(input)
    },
    appendAssistantMessage(sessionID, text) {
      runtime.appendAssistantMessage(sessionID, text)
    },
    async emitIdle(sessionID) {
      await runtime.emitIdle(sessionID)
    },
    readMessages(sessionID) {
      return runtime.readMessages(sessionID)
    },
    state() {
      const state = runtime.loopState.getState()
      return state ? { ...state, ultrawork: state.ultrawork === true } : null
    },
  }
}

export async function createLfgStandaloneOmoRuntime(): Promise<unknown> {
  const { createStandaloneOmoRuntime } = await import("@oh-my-opencode/standalone-runtime")
  return createStandaloneOmoRuntime()
}

export async function runLfgTypescriptUlw(): Promise<{ prompts: string[]; finalState: LfgTsLoopState | null }> {
  const runtime = createLfgTypescriptRuntime()
  await runtime.submitUserMessage({ sessionID: "lfg-ts-session", text: "ulw make lfg typescript" })
  await runtime.emitIdle("lfg-ts-session")
  runtime.appendAssistantMessage("lfg-ts-session", "<promise>DONE</promise>")
  await runtime.emitIdle("lfg-ts-session")
  runtime.appendAssistantMessage("lfg-ts-session", "<promise>VERIFIED</promise>")
  await runtime.emitIdle("lfg-ts-session")
  return {
    prompts: runtime.dispatchedPrompts.map((prompt) => prompt.message),
    finalState: runtime.state(),
  }
}

function createKernelBackedRuntime(): { loopState: ReturnType<typeof createUlwLoopStateController>; dispatchedPrompts: UlwPromptRequest[]; submitUserMessage(input: { sessionID: string; text: string }): Promise<void>; appendAssistantMessage(sessionID: string, text: string): void; emitIdle(sessionID: string): Promise<void>; readMessages(sessionID: string): UlwMessage[]; stop(): void } {
  const messagesBySession = new Map<string, UlwMessage[]>()
  const listeners = new Set<(event: UlwSessionEvent) => void>()
  const dispatchedPrompts: UlwPromptRequest[] = []
  const loopState = createUlwLoopStateController(createMemoryUlwLoopStateStore())
  const host: UlwHost = {
    async dispatchPrompt(request) {
      dispatchedPrompts.push(request)
      appendMessage(messagesBySession, request.sessionID, { role: "user", text: request.message })
      return { accepted: true, sessionID: request.sessionID, dispatchID: `lfg-ts-dispatch-${dispatchedPrompts.length}` }
    },
    async readMessages(sessionID) {
      return messagesBySession.get(sessionID) ?? []
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
  const engine = createUlwLoopEngine({ host, loopState })
  return {
    loopState,
    dispatchedPrompts,
    async submitUserMessage(input) {
      appendMessage(messagesBySession, input.sessionID, { role: "user", text: input.text })
      await runTrackedUlw({ host, loopState, sessionID: input.sessionID, text: input.text })
    },
    appendAssistantMessage(sessionID, text) {
      appendMessage(messagesBySession, sessionID, { role: "assistant", text })
    },
    async emitIdle(sessionID) {
      for (const listener of listeners) listener({ type: "idle", sessionID })
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
    },
    readMessages(sessionID) {
      return messagesBySession.get(sessionID) ?? []
    },
    stop() {
      engine.stop()
    },
  }
}

function appendMessage(messagesBySession: Map<string, UlwMessage[]>, sessionID: string, message: UlwMessage): void {
  messagesBySession.set(sessionID, [...messagesBySession.get(sessionID) ?? [], message])
}

export * from "./foundation/env"
export * from "./foundation/state-schema"
export * from "./services/agent-registry"
export * from "./services/model-resolution"
export * from "./services/spawn-adapter"
export * from "./services/team-store"
export * from "./commands/route"
export * from "./commands/spawn"
export * from "./commands/plan"
export * from "./commands/atlas"
export * from "./commands/boulder"
export * from "./commands/hyperplan"
export * from "./commands/status"
export * from "./commands/doctor"
export * from "./commands/agents"
export * from "./commands/models"
export * from "./commands/auth"
export * from "./commands/provider"
export * from "./commands/setup"
export * from "./commands/goal"
export * from "./commands/slash"
export * from "./commands/team"
export * from "./commands/ultrawork"
export * from "./commands/workflow-stubs"
export * from "./adapters/omo-kernel"
export * from "./adapters/omo-hooks"
export { categoryRouteCatalog } from "./commands/route"
export { agentsInspect, agentsList } from "./commands/agents"
