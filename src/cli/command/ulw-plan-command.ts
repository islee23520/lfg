import { planOmoHandoff } from "../../core/lfg/external-engine"
import { registerHandoffInOrchestrator } from "../../core/lfg/orchestrator/register-handoff"
import { findExecutableInPath } from "../../shared/executable-path"
import type { JsonObject } from "../../shared/json"

const RESULT_PATH: string | null = null
const SKILL_PATH = "skills/ulw-plan/SKILL.md"

type UlwPlanCommandOptions = {
  readonly json: boolean
  readonly noProbe: boolean
  readonly env: Readonly<Record<string, string | undefined>>
}

type ParsedUlwPlan =
  | { readonly ok: true; readonly focus: string; readonly cwd: string | null }
  | { readonly ok: false; readonly error: string }

export async function dispatchUlwPlanCommand(
  argv: readonly string[],
  options: UlwPlanCommandOptions,
): Promise<JsonObject> {
  if (!options.json) return invalidUlwPlan("ulw-plan launch planning requires --json")
  const normalized = argv[0] === "ulw-plan" || argv[0] === "codex" ? argv.slice(1) : argv
  const parsed = parseUlwPlanFlags(normalized)
  if (!parsed.ok) return invalidUlwPlan(parsed.error)

  const handoff = planOmoHandoff({
    role: "plan_assist",
    engine: "gpt",
    focus: `Load and follow $ulw-plan from ${SKILL_PATH}. Planning objective: ${parsed.focus}`,
    deliverable: `Produce a decision-complete plan under .omo/ (normal Codex work; no special receipt folder).`,
    ...(RESULT_PATH ? { resultPath: RESULT_PATH } : {}),
    ...(parsed.cwd === null ? {} : { cwd: parsed.cwd }),
  })
  if ("error" in handoff) return invalidUlwPlan(handoff.error)

  const readiness = await checkReadiness(handoff.launch.binary, options)
  let orchestrator: JsonObject
  try {
    const ledgerPath = RESULT_PATH ?? `codex-app:ulw-plan:${Date.now()}`
    const registered = await registerHandoffInOrchestrator(handoff.launch.cwd ?? process.cwd(), {
      engine: handoff.engine,
      binary: handoff.launch.binary,
      role: "plan_assist",
      focus: handoff.focus,
      resultPath: ledgerPath,
      status: "planned",
    })
    orchestrator = {
      registered: true,
      threadId: registered.thread.id,
      role: registered.thread.role,
      status: registered.thread.status,
      resultPath: registered.thread.resultPath,
    }
  } catch {
    orchestrator = { registered: false, ...(RESULT_PATH ? { resultPath: RESULT_PATH } : {}) }
  }
  return {
    ok: readiness.ok,
    status: readiness.ok ? "planned" : "not_ready",
    command: "plan",
    subcommand: "ulw-plan",
    dryRun: true,
    executed: false,
    skill: "$ulw-plan",
    skillPath: SKILL_PATH,
    ...(RESULT_PATH ? { resultPath: RESULT_PATH } : {}),
    handoff,
    readiness,
    transport: {
      primary: "app-server",
      fallback: "codex-exec",
      fullyTransferable: handoff.fullyTransferable,
      grokIsOrchestrator: handoff.grokIsOrchestrator,
    },
    orchestrator,
    lfgIsPlugin: false,
  }
}

function parseUlwPlanFlags(argv: readonly string[]): ParsedUlwPlan {
  let focus: string | null = null
  let cwd: string | null = null
  const seen = new Set<string>()
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (flag !== "--focus" && flag !== "--cwd") {
      return { ok: false, error: `Unknown ulw-plan flag: ${flag ?? ""}` }
    }
    if (seen.has(flag)) return { ok: false, error: `${flag} may only be provided once` }
    const value = argv[index + 1]
    if (typeof value !== "string" || value.length === 0 || value.startsWith("--")) {
      return { ok: false, error: `${flag} requires a value` }
    }
    seen.add(flag)
    index += 1
    if (flag === "--focus") focus = value
    if (flag === "--cwd") cwd = value
  }
  if (focus === null) return { ok: false, error: "ulw-plan requires --focus" }
  return { ok: true, focus, cwd }
}

async function checkReadiness(binary: string, options: UlwPlanCommandOptions): Promise<JsonObject> {
  if (options.noProbe) {
    return { checked: false, ok: true, status: "skipped", binary, commandPath: null }
  }
  const commandPath = await findExecutableInPath(binary, options.env)
  return commandPath === null
    ? { checked: true, ok: false, status: "missing", binary, commandPath: null }
    : { checked: true, ok: true, status: "ready", binary, commandPath }
}

function invalidUlwPlan(error: string): JsonObject {
  return {
    ok: false,
    status: "invalid_ulw_plan",
    command: "plan",
    subcommand: "ulw-plan",
    dryRun: true,
    executed: false,
    error,
    usage: "lfg --json plan ulw-plan --focus TEXT [--cwd PATH]",
    lfgIsPlugin: false,
  }
}
