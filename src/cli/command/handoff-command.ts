import {
  confirmVisionWithAgy,
  planOmoHandoff,
  planAgyVisionConfirmation,
  type AgyVisionRunner,
  type HandoffErrorDetail,
  type HandoffInput,
  type OmoHandoff,
} from "../../core/lfg/external-engine"
import { registerHandoffInOrchestrator } from "../../core/lfg/orchestrator/register-handoff"
import { findExecutableInPath } from "../../shared/executable-path"
import type { JsonObject } from "../../shared/json"
import { readBackendEnginePreference } from "../config/lfg-grok-config"
import { resolveGrokSetupHome } from "../../grok/install/grok-home"
import {
  createCodexAppServerClient,
  type AppServerClient,
  type AppServerHandoff,
} from "../../core/lfg/orchestrator/app-server"

type HandoffCommandOptions = {
  readonly json: boolean
  readonly noProbe: boolean
  readonly env: Readonly<Record<string, string | undefined>>
  readonly appServerClient?: AppServerClient
  readonly visionConfirmationRunner?: AgyVisionRunner
}

type ParsedHandoff = {
  readonly ok: true
  readonly input: HandoffInput
  readonly sessionHint?: string
  readonly appServerThreadId?: string
} | {
  readonly ok: false
  readonly error: string
}

type Readiness = {
  readonly checked: boolean
  readonly ok: boolean
  readonly status: "ready" | "missing" | "skipped"
  readonly binary: string
  readonly commandPath: string | null
  readonly action: string
}

const SINGLETON_FLAGS = new Set([
  "--role",
  "--engine",
  "--focus",
  "--deliverable",
  "--result-path",
  "--payload-file",
  "--model",
  "--cwd",
  "--session-hint",
  "--app-server-thread-id",
])

const VALUE_FLAGS = new Set([
  ...SINGLETON_FLAGS,
  "--scope",
  "--out-of-scope",
  "--accept",
  "--image",
  "--verify",
])

export async function dispatchHandoffCommand(
  argv: readonly string[],
  options: HandoffCommandOptions,
): Promise<JsonObject> {
  if (!options.json) {
    return invalidHandoff(argv[0] ?? null, "handoff plan requires --json")
  }
  if (argv.length === 0) {
    return invalidHandoff(null, "handoff requires the plan subcommand")
  }
  if (argv[0] !== "plan") {
    return invalidHandoff(argv[0] ?? null, `Unsupported handoff subcommand: ${argv[0] ?? ""}`)
  }

  const parsed = parseHandoffFlags(argv.slice(1))
  if (!parsed.ok) {
    return invalidHandoff("plan", parsed.error)
  }
  const configuredEngine = parsed.input.engine === undefined
    ? await readBackendEnginePreference(resolveGrokSetupHome(options.env))
    : null
  const handoff = planOmoHandoff({ ...parsed.input, ...(configuredEngine === null ? {} : { engine: configuredEngine }) })
  if ("error" in handoff) {
    return invalidHandoff("plan", handoff.error, handoff.detail)
  }

  const readiness = await checkReadiness(handoff, options)
  const visionConfirmation = await checkVisionConfirmation(handoff, options)
  const transport = await dispatchAppServerHandoff(handoff, parsed.appServerThreadId, options)
  const appServerThreadId = transport?.thread?.id ?? parsed.appServerThreadId ?? null
  const appServerSessionId = transport?.thread?.sessionId ?? null

  let orchestrator: JsonObject
  try {
    const registered = await registerHandoffInOrchestrator(handoff.launch.cwd ?? process.cwd(), {
      engine: handoff.engine,
      binary: handoff.launch.binary,
      role: handoff.role,
      focus: handoff.focus,
      resultPath: handoff.resultPath,
      sessionHint: parsed.sessionHint ?? appServerSessionId ?? appServerThreadId,
      appServerThreadId,
      appServerSessionId,
      status: transport?.transport === "app-server" ? "running" : "planned",
    })
    orchestrator = {
      registered: true,
      path: registered.path,
      threadId: registered.thread.id,
      resultPath: registered.thread.resultPath,
      sessionHint: registered.thread.sessionHint,
      appServerThreadId: registered.thread.appServerThreadId,
    }
  } catch {
    orchestrator = { registered: false, resultPath: handoff.resultPath }
  }

  return {
    ok: readiness.ok,
    status: readiness.ok ? transport?.transport === "app-server" ? "handed_off" : "planned" : "not_ready",
    command: "handoff",
    subcommand: "plan",
    dryRun: true,
    executed: transport?.transport === "app-server",
    handoff,
    readiness,
    visionConfirmation,
    transport,
    orchestrator,
    lfgIsPlugin: false,
  }
}

async function checkVisionConfirmation(
  handoff: OmoHandoff,
  options: HandoffCommandOptions,
): Promise<JsonObject> {
  const plan = planAgyVisionConfirmation({
    role: handoff.role,
    focus: handoff.focus,
    deliverable: handoff.deliverable,
    imagePaths: handoff.imagePaths,
  })
  return confirmVisionWithAgy(plan, {
    env: options.env,
    noProbe: options.noProbe,
    ...(options.visionConfirmationRunner ? { runner: options.visionConfirmationRunner } : {}),
  })
}

async function dispatchAppServerHandoff(
  handoff: OmoHandoff,
  threadId: string | undefined,
  options: HandoffCommandOptions,
): Promise<AppServerHandoff | null> {
  if (handoff.engine !== "gpt" || handoff.role !== "coding") return null
  const client = options.appServerClient ?? createCodexAppServerClient({ env: options.env })
  return client.handoff({
    cwd: handoff.launch.cwd ?? process.cwd(),
    prompt: handoff.workerPrompt,
    ...(handoff.launch.argv.includes("--model") ? { model: modelFromLaunch(handoff.launch.argv) } : {}),
    ...(threadId ? { threadId } : {}),
  })
}

function modelFromLaunch(argv: readonly string[]): string | undefined {
  const index = argv.indexOf("--model")
  const value = index >= 0 ? argv[index + 1] : undefined
  return typeof value === "string" && value.length > 0 ? value : undefined
}

function parseHandoffFlags(argv: readonly string[]): ParsedHandoff {
  let role: string | undefined
  let engine: string | undefined
  let focus: string | undefined
  let deliverable: string | undefined
  let resultPath: string | undefined
  let payloadFile: string | undefined
  let model: string | undefined
  let cwd: string | undefined
  let sessionHint: string | undefined
  let appServerThreadId: string | undefined
  let readOnly = false
  let yolo = false
  const scopePaths: string[] = []
  const outOfScopePaths: string[] = []
  const acceptanceCriteria: string[] = []
  const imagePaths: string[] = []
  const verifyCommands: string[] = []
  const seenSingletons = new Set<string>()

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (flag === "--read-only") {
      readOnly = true
      continue
    }
    if (flag === "--yolo") {
      yolo = true
      continue
    }
    if (typeof flag !== "string" || !VALUE_FLAGS.has(flag)) {
      if (typeof flag === "string" && flag.startsWith("--")) {
        const flagName = flag.includes("=") ? flag.slice(0, flag.indexOf("=")) : flag
        return { ok: false, error: `Unknown handoff flag: ${flagName}` }
      }
      return { ok: false, error: `Unknown handoff argument: ${flag ?? ""}` }
    }
    if (SINGLETON_FLAGS.has(flag) && seenSingletons.has(flag)) {
      return { ok: false, error: `${flag} may only be provided once` }
    }
    const value = argv[index + 1]
    if (typeof value !== "string" || value.length === 0 || value.startsWith("--")) {
      return { ok: false, error: `${flag} requires a value` }
    }
    index += 1
    if (SINGLETON_FLAGS.has(flag)) seenSingletons.add(flag)

    switch (flag) {
      case "--role": role = value; break
      case "--engine": engine = value; break
      case "--focus": focus = value; break
      case "--deliverable": deliverable = value; break
      case "--result-path": resultPath = value; break
      case "--payload-file": payloadFile = value; break
      case "--model": model = value; break
      case "--cwd": cwd = value; break
      case "--session-hint": sessionHint = value; break
      case "--app-server-thread-id": appServerThreadId = value; break
      case "--scope": scopePaths.push(value); break
      case "--out-of-scope": outOfScopePaths.push(value); break
      case "--accept": acceptanceCriteria.push(value); break
      case "--image": imagePaths.push(value); break
      case "--verify": verifyCommands.push(value); break
    }
  }

  return {
    ok: true,
    input: {
      role,
      engine,
      focus,
      deliverable,
      resultPath,
      payloadFile,
      model,
      cwd,
      readOnly,
      yolo,
      scopePaths,
      outOfScopePaths,
      acceptanceCriteria,
      imagePaths,
      verifyCommands,
    },
    sessionHint,
    appServerThreadId,
  }
}

async function checkReadiness(handoff: OmoHandoff, options: HandoffCommandOptions): Promise<Readiness> {
  const binary = handoff.launch.binary
  if (options.noProbe) {
    return {
      checked: false,
      ok: true,
      status: "skipped",
      binary,
      commandPath: null,
      action: "Readiness probe skipped; verify the command is on PATH before execution.",
    }
  }

  const commandPath = await findExecutableInPath(binary, options.env)
  return commandPath === null
    ? {
        checked: true,
        ok: false,
        status: "missing",
        binary,
        commandPath: null,
        action: `Install ${binary} or expose it on PATH, then rerun the handoff plan.`,
      }
    : {
        checked: true,
        ok: true,
        status: "ready",
        binary,
        commandPath,
        action: "No action required.",
      }
}

function invalidHandoff(
  subcommand: string | null,
  error: string,
  detail?: HandoffErrorDetail,
): JsonObject {
  return {
    ok: false,
    status: "invalid_handoff",
    command: "handoff",
    subcommand,
    dryRun: true,
    executed: false,
    error,
    ...(detail === undefined ? {} : { detail }),
    usage: "lfg --json handoff plan [--role ROLE] [--engine gpt] [flags]",
    lfgIsPlugin: false,
  }
}
