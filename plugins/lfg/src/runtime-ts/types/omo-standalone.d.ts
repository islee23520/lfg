declare module "*/dist/index.js" {
  export const addBoulderWork: unknown
  export const completeBoulder: unknown
  export const createBoulderState: unknown
  export const getBoulderFilePath: unknown
  export const readBoulderState: unknown
  export const selectActiveWork: unknown
  export const writeBoulderState: unknown
  export const resolveModel: unknown
  export const resolveModelWithFallback: unknown
  export const createStandaloneOmoRuntime: unknown
  export const buildContinuationPrompt: unknown
  export const createUlwLoopEngine: unknown
  export const runTrackedUlw: unknown
  export const createMemoryUlwLoopStateStore: unknown
  export const createUlwLoopStateController: unknown
  export const detectUlwIntent: unknown
  export const removeCode: unknown
  export const deepMerge: unknown
}

declare module "@oh-my-opencode/boulder-state" {
  export interface BoulderState {
    schema_version?: 2
    active_work_id?: string
    works?: Record<string, BoulderWorkState>
    active_plan: string
    started_at: string
    ended_at?: string
    elapsed_ms?: number
    status?: BoulderWorkStatus
    updated_at?: string
    session_ids: string[]
    session_origins?: Record<string, "direct" | "appended">
    plan_name: string
    agent?: string
    worktree_path?: string
    task_sessions?: Record<string, unknown>
  }
  export type BoulderWorkStatus = "active" | "completed" | "paused" | "abandoned"
  export interface BoulderWorkState extends BoulderState { work_id: string }
  export function createBoulderState(planPath: string, sessionId: string, agent?: string, worktreePath?: string): BoulderState
  export function readBoulderState(directory: string): BoulderState | null
  export function writeBoulderState(directory: string, state: BoulderState): boolean
  export function addBoulderWork(directory: string, input: { planPath: string; sessionId: string; agent?: string; worktreePath?: string; startedAt?: string }): BoulderState | null
  export function completeBoulder(directory: string, workId?: string, endedAt?: string): BoulderState | null
  export function selectActiveWork(directory: string, workId: string): BoulderState | null
  export function getBoulderFilePath(directory: string): string
}

declare module "@oh-my-opencode/model-core" {
  export type ModelSource = "override" | "category-default" | "provider-fallback" | "system-default"
  export type ModelResolutionResult = { model: string; source: ModelSource; variant?: string }
  export type ExtendedModelResolutionInput = { uiSelectedModel?: string; userModel?: string; userFallbackModels?: string[]; categoryDefaultModel?: string; fallbackChain?: Array<{ providers: string[]; model: string; variant?: string }>; availableModels: Set<string>; systemDefaultModel?: string }
  export function resolveModel(input: { userModel?: string; inheritedModel?: string; systemDefault?: string }): string | undefined
  export function resolveModelWithFallback(input: ExtendedModelResolutionInput, connectedProvidersAdapter?: unknown): ModelResolutionResult | undefined
}

declare module "@oh-my-opencode/standalone-runtime" {
  import type { UlwHost, UlwMessage, UlwPromptRequest } from "@oh-my-opencode/ulw-host-contract"
  import type { UlwLoopStateController } from "@oh-my-opencode/ulw-loop-state"
  export type StandaloneOmoRuntime = { host: UlwHost; loopState: UlwLoopStateController; dispatchedPrompts: UlwPromptRequest[]; submitUserMessage(input: { sessionID: string; text: string }): Promise<void>; appendAssistantMessage(sessionID: string, text: string): void; emitIdle(sessionID: string): Promise<void>; readMessages(sessionID: string): UlwMessage[]; stop(): void }
  export function createStandaloneOmoRuntime(): StandaloneOmoRuntime
}

declare module "@oh-my-opencode/ulw-host-contract" {
  export type UlwMessage = { role: "user" | "assistant" | "system" | "tool"; text: string }
  export type UlwPromptRequest = { sessionID: string; message: string; agentName?: string; modelID?: string }
  export type UlwPromptReceipt = { accepted: boolean; sessionID: string; dispatchID: string }
  export type UlwSessionEvent = { type: "idle"; sessionID: string }
  export type UlwHost = { dispatchPrompt(request: UlwPromptRequest): Promise<UlwPromptReceipt>; readMessages(sessionID: string): Promise<UlwMessage[]>; readTodos(): Promise<unknown[]>; readStatus(): Promise<string>; abort(): Promise<void>; onEvent(listener: (event: UlwSessionEvent) => void): () => void }
}

declare module "@oh-my-opencode/ulw-loop-state" {
  export type UlwLoopStrategy = "reset" | "continue"
  export type UlwLoopState = { active: boolean; iteration: number; maxIterations: number; completionPromise: string; initialCompletionPromise: string; startedAt: string; prompt: string; sessionID: string; messageCountAtStart?: number; verificationPending?: boolean; verificationAttemptID?: string; verificationSessionID?: string; strategy: UlwLoopStrategy; ultrawork?: boolean }
  export type UlwLoopStateStore = { read(): UlwLoopState | null; write(state: UlwLoopState): void; clear(): void }
  export type UlwLoopStateController = { start(options: { sessionID: string; prompt: string; maxIterations?: number; completionPromise?: string; messageCountAtStart?: number; ultrawork?: boolean; strategy?: UlwLoopStrategy; now?: () => string }): UlwLoopState; cancel(sessionID: string): boolean; getState(): UlwLoopState | null; clear(): void; incrementIteration(expected?: { iteration: number; sessionID: string }): UlwLoopState | null; markVerificationPending(sessionID: string, messageCountAtStart?: number): UlwLoopState | null; setSessionID(sessionID: string, nextSessionID: string): UlwLoopState | null; setMessageCountAtStart(sessionID: string, count: number, expectedStartedAt?: string): UlwLoopState | null; setVerificationSessionID(sessionID: string, verificationSessionID: string): UlwLoopState | null; restartAfterFailedVerification(sessionID: string, messageCountAtStart?: number): UlwLoopState | null; clearVerificationState(sessionID: string, messageCountAtStart?: number): UlwLoopState | null }
  export function createMemoryUlwLoopStateStore(initialState?: UlwLoopState | null): UlwLoopStateStore
  export function createUlwLoopStateController(store: UlwLoopStateStore): UlwLoopStateController
}

declare module "@oh-my-opencode/ulw-kernel" {
  import type { UlwHost } from "@oh-my-opencode/ulw-host-contract"
  import type { UlwLoopState } from "@oh-my-opencode/ulw-loop-state"
  import type { UlwLoopStateController } from "@oh-my-opencode/ulw-loop-state"
  export type UlwLoopEngine = { stop(): void }
  export function buildContinuationPrompt(state: UlwLoopState): string
  export function createUlwLoopEngine(options: { host: UlwHost; loopState: UlwLoopStateController }): UlwLoopEngine
  export function runTrackedUlw(input: unknown): Promise<{ dispatched: boolean; intents: string[]; receipts: Array<{ accepted: boolean; sessionID: string; dispatchID: string }> }>
}

declare module "@oh-my-opencode/ulw-intent" {
  export type UlwIntentType = "ultrawork" | "hyperplan" | "hyperplan-ultrawork"
  export type UlwIntent = { type: UlwIntentType; prompt: string }
  export function detectUlwIntent(text: string): UlwIntent[]
  export function removeCode(text: string): string
}

declare module "@oh-my-opencode/utils" {
  export function deepMerge<T extends Record<string, unknown>>(base: T, override: Partial<T>, depth?: number): T
}
