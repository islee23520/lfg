import type { OrchestratorInbox, OrchestratorThread, ThreadStatus } from "./inbox"
import { loadOrchestratorInbox, registerCodexThread, saveOrchestratorInbox } from "./inbox"

export type HandoffRegistrationInput = {
  readonly engine: string
  readonly binary: string
  readonly role: string
  readonly focus: string
  readonly resultPath: string
  readonly status?: ThreadStatus
  readonly askId?: string | null
  readonly sessionHint?: string | null
  readonly appServerThreadId?: string | null
  readonly appServerSessionId?: string | null
}

export type HandoffOrchestratorRegistration = {
  readonly inbox: OrchestratorInbox
  readonly thread: OrchestratorThread
  readonly path: string
}

export async function registerHandoffInOrchestrator(
  projectRoot: string,
  input: HandoffRegistrationInput,
): Promise<HandoffOrchestratorRegistration> {
  const inbox = await loadOrchestratorInbox(projectRoot)
  const registered = registerCodexThread(inbox, input)
  const path = await saveOrchestratorInbox(projectRoot, registered.inbox)
  return { ...registered, path }
}
