/**
 * OMO-like experience on GrokBuild:
 *   Grok = Sisyphus orchestrator (plan / ulw-loop / ledger)
 *   Codex app-server (gpt) = sole external worker for every handoff role
 *   codex exec = fallback only when the app-server daemon is unavailable
 *
 * Pure handoff builders only — no process spawn, no login ownership.
 *
 * @see docs/grok-external-engine-orchestration.md
 */

export {
  ENGINES,
  ENGINE_PROFILES,
  DEFAULT_BACKEND_ENGINE,
  backendEngineSelectionJson,
  isEngine,
  normalizeEngine,
  type Engine,
  type EngineProfile,
} from "./engines"

export {
  GROK_ORCHESTRATOR_ROLES,
  OMO_WORKER_ROLES,
  defaultEngineForRole,
  getRoleSpec,
  normalizeOmoRole,
  type OmoWorkerRole,
  type RoleSpec,
  type SafetyMode,
} from "./omo-roles"

export {
  planOmoHandoff,
  type HandoffError,
  type HandoffErrorDetail,
  type HandoffInput,
  type HandoffResult,
  type LaunchPlan,
  type OmoHandoff,
} from "./handoff"

export {
  confirmVisionWithAgy,
  parseAgyVisionVerdict,
  planAgyVisionConfirmation,
  type AgyVisionConfirmation,
  type AgyVisionConfirmationPlan,
  type AgyVisionRunner,
} from "./vision-confirmation"
