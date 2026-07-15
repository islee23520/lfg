import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { findExecutableInPath } from "../../../shared/executable-path"
import type { OmoWorkerRole } from "./omo-roles"

const execFileAsync = promisify(execFile)
const VISUAL_ROLES: ReadonlySet<OmoWorkerRole> = new Set(["vision", "visual_qa", "multimodal"])
const VISUAL_INTENT = /\b(?:screenshot|visual[ _-]?qa|ui screenshot|image verify|verify (?:the )?image)\b/i
const DEFAULT_TIMEOUT_MS = 20_000

export type AgyVisionVerdict = "pass" | "fail" | "uncertain" | "unavailable" | "skipped"

export type AgyVisionConfirmationPlan = {
  readonly requested: boolean
  readonly optional: true
  readonly blocking: false
  readonly binary: "agy"
  readonly imagePaths: readonly string[]
  readonly reason: "visual_role" | "visual_keyword" | "not_visual" | "no_images"
}

export type AgyVisionRunResult = {
  readonly stdout: string
  readonly stderr?: string
}

export type AgyVisionRunner = (input: {
  readonly binary: string
  readonly args: readonly string[]
  readonly env: Readonly<Record<string, string | undefined>>
  readonly timeoutMs: number
}) => Promise<AgyVisionRunResult>

export type AgyVisionConfirmation = AgyVisionConfirmationPlan & {
  readonly status: AgyVisionVerdict
  readonly commandPath: string | null
  readonly contextBlock: string
  readonly output: string
}

export function planAgyVisionConfirmation(input: {
  readonly role: OmoWorkerRole
  readonly focus?: string
  readonly deliverable?: string
  readonly imagePaths: readonly string[]
}): AgyVisionConfirmationPlan {
  const hasImages = input.imagePaths.length > 0
  const visualRole = VISUAL_ROLES.has(input.role)
  const visualKeyword = VISUAL_INTENT.test(`${input.focus ?? ""}\n${input.deliverable ?? ""}`)
  const reason = !hasImages ? "no_images" : visualRole ? "visual_role" : visualKeyword ? "visual_keyword" : "not_visual"
  return {
    requested: hasImages && (visualRole || visualKeyword),
    optional: true,
    blocking: false,
    binary: "agy",
    imagePaths: input.imagePaths,
    reason,
  }
}

export async function confirmVisionWithAgy(
  plan: AgyVisionConfirmationPlan,
  options: {
    readonly env: Readonly<Record<string, string | undefined>>
    readonly noProbe?: boolean
    readonly timeoutMs?: number
    readonly runner?: AgyVisionRunner
  },
): Promise<AgyVisionConfirmation> {
  if (!plan.requested || options.noProbe === true) {
    return confirmation(plan, "skipped", null, "")
  }
  const commandPath = await findExecutableInPath(plan.binary, options.env)
  if (commandPath === null) return confirmation(plan, "skipped", null, "agy is not on PATH")

  const prompt = "Independently inspect the supplied visual evidence. Reply PASS, FAIL, or UNCERTAIN, then one short reason. Do not implement or edit anything."
  const args = ["--print", prompt, ...plan.imagePaths.flatMap((path) => ["--image", path])]
  try {
    const result = await (options.runner ?? runAgy)({
      binary: commandPath,
      args,
      env: options.env,
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    })
    const output = `${result.stdout}\n${result.stderr ?? ""}`.trim().slice(0, 2_000)
    return confirmation(plan, parseAgyVisionVerdict(output), commandPath, output)
  } catch (error) {
    const output = error instanceof Error ? error.message.slice(0, 2_000) : String(error).slice(0, 2_000)
    return confirmation(plan, "uncertain", commandPath, output)
  }
}

export function parseAgyVisionVerdict(output: string): Exclude<AgyVisionVerdict, "unavailable" | "skipped"> {
  const normalized = output.trim().toLowerCase()
  if (/\bpass(?:ed)?\b/.test(normalized)) return "pass"
  if (/\bfail(?:ed|ure)?\b/.test(normalized)) return "fail"
  return "uncertain"
}

async function runAgy(input: {
  readonly binary: string
  readonly args: readonly string[]
  readonly env: Readonly<Record<string, string | undefined>>
  readonly timeoutMs: number
}): Promise<AgyVisionRunResult> {
  const result = await execFileAsync(input.binary, [...input.args], {
    env: { ...process.env, ...input.env },
    encoding: "utf8",
    timeout: input.timeoutMs,
    maxBuffer: 1024 * 1024,
  })
  return { stdout: result.stdout, stderr: result.stderr }
}

function confirmation(
  plan: AgyVisionConfirmationPlan,
  status: AgyVisionVerdict,
  commandPath: string | null,
  output: string,
): AgyVisionConfirmation {
  const detail = output.length > 0 ? output.replaceAll("</lfg-agy-vision-confirm>", "").slice(0, 1_000) : "none"
  return {
    ...plan,
    status,
    commandPath,
    output,
    contextBlock: [
      "<lfg-agy-vision-confirm>",
      `status=${status} optional=yes blocking=no`,
      `detail=${detail}`,
      "agy is a confirmation sidecar only; Codex remains the product implementer.",
      "</lfg-agy-vision-confirm>",
    ].join("\n"),
  }
}
