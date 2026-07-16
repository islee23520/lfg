import { planOmoHandoff } from "../../core/lfg/external-engine"
import { registerHandoffInOrchestrator } from "../../core/lfg/orchestrator/register-handoff"
import { findExecutableInPath } from "../../shared/executable-path"
import type { JsonObject } from "../../shared/json"

const RESULT_PATH: string | null = null // natural Codex work — no receipt folder

type StartWorkCommandOptions = {
  readonly json: boolean
  readonly noProbe: boolean
  readonly env: Readonly<Record<string, string | undefined>>
}

type ParsedStartWork =
  | { readonly ok: true; readonly focus: string; readonly planPath: string | null; readonly cwd: string | null }
  | { readonly ok: false; readonly error: string }

export async function dispatchStartWorkCommand(
  argv: readonly string[],
  options: StartWorkCommandOptions,
): Promise<JsonObject> {
  if (!options.json) return invalidStartWork("start-work planning requires --json")
  const normalized = argv[0] === "start-work" ? argv.slice(1) : argv[0] === "launch" ? argv.slice(1) : argv
  const parsed = parseStartWorkFlags(normalized)
  if (!parsed.ok) return invalidStartWork(parsed.error)

  const planInstruction = parsed.planPath === null
    ? `Use $start-work for this objective: ${parsed.focus}`
    : `Use $start-work to execute plan ${parsed.planPath}. Focus: ${parsed.focus}`
  const handoff = planOmoHandoff({
    role: "coding",
    engine: "gpt",
    focus: planInstruction,
    deliverable: `Execute the selected plan through $start-work in the project as normal Codex work.`,
    ...(RESULT_PATH ? { resultPath: RESULT_PATH } : {}),
    ...(parsed.cwd === null ? {} : { cwd: parsed.cwd }),
  })
  if ("error" in handoff) return invalidStartWork(handoff.error)

  const readiness = await checkReadiness(handoff.launch.binary, options)
  let orchestrator: JsonObject
  try {
    const ledgerPath = RESULT_PATH ?? `codex-app:start-work:${Date.now()}`
    const registered = await registerHandoffInOrchestrator(handoff.launch.cwd ?? process.cwd(), {
      engine: handoff.engine,
      binary: handoff.launch.binary,
      role: "coding",
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
    subcommand: "start-work",
    dryRun: true,
    executed: false,
    skill: "$start-work",
    planPath: parsed.planPath,
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

function parseStartWorkFlags(argv: readonly string[]): ParsedStartWork {
  let focus: string | null = null
  let planPath: string | null = null
  let cwd: string | null = null
  const seen = new Set<string>()
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (flag !== "--focus" && flag !== "--plan" && flag !== "--cwd") {
      return { ok: false, error: `Unknown start-work flag: ${flag ?? ""}` }
    }
    if (seen.has(flag)) return { ok: false, error: `${flag} may only be provided once` }
    const value = argv[index + 1]
    if (typeof value !== "string" || value.length === 0 || value.startsWith("--")) {
      return { ok: false, error: `${flag} requires a value` }
    }
    seen.add(flag)
    index += 1
    if (flag === "--focus") focus = value
    if (flag === "--plan") planPath = value
    if (flag === "--cwd") cwd = value
  }
  if (focus === null && planPath === null) {
    return { ok: false, error: "start-work requires --focus or --plan" }
  }
  return { ok: true, focus: focus ?? `Execute ${planPath ?? "the selected plan"}`, planPath, cwd }
}

async function checkReadiness(
  binary: string,
  options: StartWorkCommandOptions,
): Promise<JsonObject> {
  if (options.noProbe) {
    return { checked: false, ok: true, status: "skipped", binary, commandPath: null }
  }
  const commandPath = await findExecutableInPath(binary, options.env)
  return commandPath === null
    ? { checked: true, ok: false, status: "missing", binary, commandPath: null }
    : { checked: true, ok: true, status: "ready", binary, commandPath }
}

function invalidStartWork(error: string): JsonObject {
  return {
    ok: false,
    status: "invalid_start_work_plan",
    command: "plan",
    subcommand: "start-work",
    dryRun: true,
    executed: false,
    error,
    usage: "lfg --json plan start-work [--plan PATH] [--focus TEXT] [--cwd PATH]",
    lfgIsPlugin: false,
  }
}
