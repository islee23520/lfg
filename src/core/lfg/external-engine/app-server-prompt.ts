/**
 * Compose the text sent to Codex App `turn/start`.
 *
 * Historically only the generic OMO worker template (`workerPrompt`) was
 * submitted to app-server, while `--payload-file` was piped only to
 * `codex exec` stdin. That forced relaunches via codex-exec for full briefs.
 * App-server turns must include the full payload when present.
 */

import { readFile } from "node:fs/promises"
import { isAbsolute, resolve } from "node:path"

export type AppServerTurnPrompt = {
  readonly prompt: string
  /** Short objective for thread/goal/set (UI-friendly). */
  readonly goalObjective: string
  readonly includedPayloadFile: string | null
  readonly bytes: number
  readonly payloadMissing: boolean
}

export async function buildAppServerTurnPrompt(input: {
  readonly workerPrompt: string
  readonly focus: string
  readonly payloadFile?: string | null
  readonly cwd?: string
}): Promise<AppServerTurnPrompt> {
  const focus = input.focus.replace(/\s+/g, " ").trim()
  const base = input.workerPrompt.trim()
  const goalObjective = focus.length > 0 ? focus.slice(0, 500) : base.slice(0, 500)
  const file = typeof input.payloadFile === "string" ? input.payloadFile.trim() : ""
  if (file.length === 0) {
    return {
      prompt: base,
      goalObjective,
      includedPayloadFile: null,
      bytes: byteLength(base),
      payloadMissing: false,
    }
  }

  const absolute = isAbsolute(file) ? file : resolve(input.cwd ?? process.cwd(), file)
  let body: string
  try {
    body = await readFile(absolute, "utf8")
  } catch {
    const warning = [
      base,
      "",
      "## WARNING — payload file unreadable",
      `Expected full task payload at \`${file}\` but it could not be read.`,
      "Do not invent the missing brief; fail closed with RESULT blocked.",
    ].join("\n")
    return {
      prompt: warning,
      goalObjective,
      includedPayloadFile: null,
      bytes: byteLength(warning),
      payloadMissing: true,
    }
  }

  const trimmed = body.trim()
  if (trimmed.length === 0) {
    return {
      prompt: base,
      goalObjective,
      includedPayloadFile: file,
      bytes: byteLength(base),
      payloadMissing: false,
    }
  }

  // Already fully inlined — do not double-append.
  if (base.includes(trimmed)) {
    return {
      prompt: base,
      goalObjective,
      includedPayloadFile: file,
      bytes: byteLength(base),
      payloadMissing: false,
    }
  }

  const composed = [
    base,
    "",
    "## FULL TASK PAYLOAD (authoritative)",
    "The template above is scaffolding only. The payload body is the real work brief.",
    `Source: \`${file}\``,
    "",
    trimmed,
    "",
    "## END FULL TASK PAYLOAD",
    "Implement the payload requirements. Write STATUS/SUMMARY/EVIDENCE to the RESULT path named in the template.",
  ].join("\n")

  return {
    prompt: composed,
    goalObjective,
    includedPayloadFile: file,
    bytes: byteLength(composed),
    payloadMissing: false,
  }
}

function byteLength(text: string): number {
  return Buffer.byteLength(text, "utf8")
}
