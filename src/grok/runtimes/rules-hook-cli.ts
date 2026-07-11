#!/usr/bin/env node
import { join } from "node:path"
import { buildRuleContext } from "../ports/rules-injector"

type HookPayload = {
  readonly cwd: string
  readonly hook_event_name: string
  readonly tool_input?: unknown
}

async function main(): Promise<number> {
  const payload = parseHookPayload(await readStdin())
  if (payload === null) {
    process.stderr.write("LFG-RULES-HOOK-ERROR: malformed JSON payload\n")
    return 1
  }

  const result = await buildRuleContext({
    cwd: payload.cwd,
    currentFile: resolveCurrentFile(payload),
  })
  if (result.contextBlock.length === 0) return 0

  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: payload.hook_event_name,
        additionalContext: result.contextBlock,
      },
    })}\n`,
  )
  return 0
}

function resolveCurrentFile(payload: HookPayload): string {
  const toolInput = payload.tool_input
  if (isRecord(toolInput)) {
    for (const key of ["file_path", "filePath", "path"] as const) {
      const value = toolInput[key]
      if (typeof value === "string" && value.length > 0) return value
    }
  }
  return join(payload.cwd, "AGENTS.md")
}

function parseHookPayload(raw: string): HookPayload | null {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) return null
    return typeof parsed.cwd === "string" && typeof parsed.hook_event_name === "string"
      ? {
          cwd: parsed.cwd,
          hook_event_name: parsed.hook_event_name,
          ...(Object.hasOwn(parsed, "tool_input") ? { tool_input: parsed.tool_input } : {}),
        }
      : null
  } catch (error) {
    if (error instanceof SyntaxError) return null
    throw error
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let raw = ""
    process.stdin.setEncoding("utf8")
    process.stdin.on("data", (chunk: string) => {
      raw += chunk
    })
    process.stdin.on("end", () => resolve(raw))
    process.stdin.on("error", reject)
  })
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    process.stderr.write(`LFG-RULES-HOOK-ERROR: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(1)
  })
