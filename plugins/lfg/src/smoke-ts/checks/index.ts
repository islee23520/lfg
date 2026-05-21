import { agentsGuidesValidity, manifestAndFileChecks } from "./manifest-files"
import { hookBridgePytest, hookSmoke } from "./hooks"
import { mcpSmoke } from "./mcp"
import { omoHookParityEvidence, runtimeSmokeCoverage, runtimeSmokes } from "./runtime"
import type { SmokeCheck } from "../types"

export const SELF_TEST_CHECKS: SmokeCheck[] = [
  manifestAndFileChecks,
  agentsGuidesValidity,
  hookSmoke,
  hookBridgePytest,
  mcpSmoke,
  runtimeSmokes,
  runtimeSmokeCoverage,
  omoHookParityEvidence,
]
