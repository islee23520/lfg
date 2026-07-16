/**
 * OMO-like full handoff: Grok (Sisyphus) orchestrates; Codex/GPT executes.
 */

import { ENGINE_PROFILES, type Engine, normalizeEngine } from "./engines"
import { buildHandoffLaunch, type LaunchPlan } from "./launch"
import {
  getRoleSpec,
  GROK_ORCHESTRATOR_ROLES,
  normalizeOmoRole,
  type OmoWorkerRole,
  type SafetyMode,
} from "./omo-roles"
import { buildHandoffPrompt, HANDOFF_HONESTY } from "./prompt"
import { enrichFocusWithSkillRoute, routeOmoSkills } from "./skill-route"

export type { LaunchPlan } from "./launch"

export type HandoffInput = {
  /** OMO worker role (coding, oracle, vision, …). */
  readonly role?: OmoWorkerRole | string
  /** Force engine; default from OMO role map. */
  readonly engine?: Engine | string
  readonly focus?: string
  readonly deliverable?: string
  readonly scopePaths?: readonly string[]
  readonly outOfScopePaths?: readonly string[]
  readonly acceptanceCriteria?: readonly string[]
  readonly imagePaths?: readonly string[]
  readonly agentsMdExcerpt?: string
  readonly skillExcerpts?: Readonly<Record<string, string>>
  readonly verifyCommands?: readonly string[]
  readonly resultPath?: string
  readonly payloadFile?: string
  readonly model?: string
  readonly cwd?: string
  readonly readOnly?: boolean
  readonly yolo?: boolean
}

export type OmoHandoff = {
  readonly schemaVersion: 1
  readonly kind: "omo-like-external-handoff"
  readonly fullyTransferable: true
  readonly noGrokSubagentsRequired: true
  readonly grokIsOrchestrator: true
  readonly role: OmoWorkerRole
  readonly engine: Engine
  readonly omoFamily: "gpt"
  readonly safetyMode: SafetyMode
  readonly canWrite: boolean
  readonly persona: string
  readonly focus: string
  readonly deliverable: string
  readonly scopePaths: readonly string[]
  readonly outOfScopePaths: readonly string[]
  readonly imagePaths: readonly string[]
  readonly acceptanceCriteria: readonly string[]
  readonly verifyCommands: readonly string[]
  readonly resultPath: string | null
  readonly workerPrompt: string
  readonly payloadMarkdown: string
  readonly launch: LaunchPlan
  readonly honestyNote: string
  readonly guidance: string
  readonly skillRoute: ReturnType<typeof routeOmoSkills>
}

export type HandoffErrorDetail =
  | {
      readonly code: "unsafe_inline_prompt"
      readonly remediation: "use_payload_file"
      readonly flag: "--payload-file"
    }
  | {
      readonly code: "unsafe_launch_argv"
      readonly remediation: "remove_forbidden_characters"
    }

export type HandoffError = {
  readonly error: string
  readonly detail?: HandoffErrorDetail
}

export type HandoffResult = OmoHandoff | HandoffError

const FORBIDDEN_LAUNCH_ARGV_TOKEN = /\$\(|[<>|]/

/** Plan an OMO-style external worker handoff. */
export function planOmoHandoff(input: HandoffInput = {}): HandoffResult {
  if (typeof input.role === "string") {
    const raw = input.role.trim().toLowerCase().replace(/\s+/g, "_")
    if (GROK_ORCHESTRATOR_ROLES.some((role) => role === raw)) {
      return { error: `role "${raw}" is a Grok orchestrator role — do not hand off; keep on Grok` }
    }
  }

  const role = normalizeOmoRole(input.role)
  if (role === undefined) {
    return { error: `unknown OMO worker role: ${String(input.role)} (coding|hephaestus|oracle|vision|…)` }
  }

  const spec = getRoleSpec(role)
  let engine: Engine = spec.engine
  if (input.engine !== undefined && input.engine !== null && input.engine !== "") {
    const candidate = normalizeEngine(input.engine)
    if (candidate === undefined) {
      return { error: `unknown engine: ${String(input.engine)} (expected gpt)` }
    }
    engine = candidate
  }

  if (Boolean(input.yolo) && (!spec.canWrite || Boolean(input.readOnly))) {
    return { error: "--yolo requires a write-capable role" }
  }

  const canWrite = spec.canWrite && !Boolean(input.readOnly)
  const safetyMode: SafetyMode = canWrite ? "write" : "read"
  const rawFocus = nonEmpty(input.focus) ?? spec.defaultFocus
  const { focus, route: skillRoute } = enrichFocusWithSkillRoute(rawFocus)
  const deliverable = nonEmpty(input.deliverable) ?? spec.defaultDeliverable
  const scopePaths = list(input.scopePaths)
  const outOfScopePaths = list(input.outOfScopePaths)
  const imagePaths = list(input.imagePaths)
  const acceptanceCriteria = list(input.acceptanceCriteria)
  const verifyCommands = list(input.verifyCommands)
  // Natural Codex mode: no mandatory .omo/external-engine receipt unless --result-path is set.
  const resultPath = nonEmpty(input.resultPath) ?? null
  const payloadFile = nonEmpty(input.payloadFile)
  const workerPrompt = buildHandoffPrompt({
    spec,
    engine,
    safetyMode,
    canWrite,
    focus,
    deliverable,
    scopePaths,
    outOfScopePaths,
    imagePaths,
    acceptanceCriteria,
    verifyCommands,
    resultPath,
    agentsMdExcerpt: input.agentsMdExcerpt,
    skillExcerpts: input.skillExcerpts,
    skillRoute,
  })
  if (!payloadFile && FORBIDDEN_LAUNCH_ARGV_TOKEN.test(workerPrompt)) {
    return {
      error: "Inline prompt contains forbidden launch argv characters. Use --payload-file for this content.",
      detail: {
        code: "unsafe_inline_prompt",
        remediation: "use_payload_file",
        flag: "--payload-file",
      },
    }
  }
  const payloadMarkdown = [
    "---",
    "handoff_schema: 1",
    "kind: omo-like-external-handoff",
    `role: ${role}`,
    `engine: ${engine}`,
    `safety: ${safetyMode}`,
    resultPath === null ? "result_path: (none — natural Codex work)" : `result_path: ${resultPath}`,
    "---",
    "",
    workerPrompt,
  ].join("\n")
  const launch = buildHandoffLaunch({
    engine,
    canWrite,
    yolo: Boolean(input.yolo),
    model: nonEmpty(input.model),
    cwd: nonEmpty(input.cwd),
    payloadFile,
    workerPrompt,
  })
  if (launch.argv.some((token) => FORBIDDEN_LAUNCH_ARGV_TOKEN.test(token))) {
    return {
      error: "Generated launch argv contains forbidden characters; remove them from launch options.",
      detail: {
        code: "unsafe_launch_argv",
        remediation: "remove_forbidden_characters",
      },
    }
  }
  const profile = ENGINE_PROFILES[engine]

  return {
    schemaVersion: 1,
    kind: "omo-like-external-handoff",
    fullyTransferable: true,
    noGrokSubagentsRequired: true,
    grokIsOrchestrator: true,
    role,
    engine,
    omoFamily: profile.omoFamily,
    safetyMode,
    canWrite,
    persona: spec.persona,
    focus,
    deliverable,
    scopePaths,
    outOfScopePaths,
    imagePaths,
    acceptanceCriteria,
    verifyCommands,
    resultPath,
    workerPrompt,
    payloadMarkdown,
    launch,
    skillRoute,
    honestyNote: HANDOFF_HONESTY,
    guidance:
      `OMO-like: Grok orchestrates; hand ${role} to ${engine} (${profile.binary}). ` +
      `Family=${profile.omoFamily}. ${profile.notes}`,
  }
}

function nonEmpty(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function list(values: readonly string[] | undefined): readonly string[] {
  if (!values) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const value of values) {
    const trimmed = value.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    out.push(trimmed)
  }
  return out
}
