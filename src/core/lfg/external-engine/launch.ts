import { ENGINE_PROFILES, type Engine } from "./engines"

export type LaunchPlan = {
  readonly engine: Engine
  readonly binary: string
  readonly argv: readonly string[]
  readonly cwd?: string
  readonly stdinSource:
    | { readonly kind: "none" }
    | { readonly kind: "file"; readonly path: string }
  readonly example: string
  readonly hostBackground: true
  readonly hostTimeoutZero: true
  readonly cancelKillsProcessGroup: true
}

type LaunchInput = {
  readonly engine: Engine
  readonly canWrite: boolean
  readonly yolo: boolean
  readonly model?: string
  readonly cwd?: string
  readonly payloadFile?: string
  readonly workerPrompt: string
}

export function buildHandoffLaunch(input: LaunchInput): LaunchPlan {
  const profile = ENGINE_PROFILES[input.engine]
  const argv: string[] = [profile.binary]
  const stdinSource = input.payloadFile
    ? ({ kind: "file", path: input.payloadFile } as const)
    : ({ kind: "none" } as const)

  argv.push("exec")
  if (!input.canWrite) argv.push("--sandbox", "read-only")
  else if (!input.yolo) argv.push("--sandbox", "workspace-write")
  if (input.model) argv.push("--model", input.model)
  if (input.cwd) argv.push("--cd", input.cwd)
  if (input.yolo) argv.push("--dangerously-bypass-approvals-and-sandbox")
  argv.push(input.payloadFile ? "-" : input.workerPrompt)

  // ponytail: Display text is POSIX-shaped; portable execution uses argv + stdinSource.
  const example = `${argv.map(shellQuote).join(" ")}${
    input.payloadFile ? ` # stdin file: ${shellQuote(input.payloadFile)}` : ""
  }`

  return {
    engine: input.engine,
    binary: profile.binary,
    argv,
    ...(input.cwd ? { cwd: input.cwd } : {}),
    stdinSource,
    example,
    hostBackground: true,
    hostTimeoutZero: true,
    cancelKillsProcessGroup: true,
  }
}

function shellQuote(token: string): string {
  if (token.length === 0) return "''"
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(token)) return token
  return `'${token.replaceAll("'", "'\\''")}'`
}
