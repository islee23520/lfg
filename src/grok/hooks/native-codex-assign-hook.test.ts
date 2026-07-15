import { spawn } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"
import { addNativeCodexAssignHooks, NATIVE_CODEX_ASSIGN_FILE } from "./native-codex-assign-hook-registration"

const hookPath = join(dirname(fileURLToPath(import.meta.url)), "..", "assets", "hooks", NATIVE_CODEX_ASSIGN_FILE)
const LOW_NUDGE_POLICY_TAG = '<lfg-sisyphus-low-nudge-policy mode="terminal-only">'

async function runHook(prompt: string, hookEventName = "UserPromptSubmit"): Promise<{ exitCode: number; stdout: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [hookPath], { stdio: ["pipe", "pipe", "pipe"] })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (c) => {
      stdout += String(c)
    })
    child.stderr.on("data", (c) => {
      stderr += String(c)
    })
    child.on("error", reject)
    child.on("close", (code) => {
      if (stderr.length > 0 && (code ?? 1) !== 0) {
        reject(new Error(stderr))
        return
      }
      resolve({ exitCode: code ?? 1, stdout })
    })
    child.stdin.end(JSON.stringify({ hookEventName, prompt }))
  })
}

function parseAdditionalContext(stdout: string): string {
  const parsed: unknown = JSON.parse(stdout)
  if (typeof parsed !== "object" || parsed === null || !("hookSpecificOutput" in parsed)) return ""
  const hookOutput = parsed.hookSpecificOutput
  if (typeof hookOutput !== "object" || hookOutput === null || !("additionalContext" in hookOutput)) return ""
  return typeof hookOutput.additionalContext === "string" ? hookOutput.additionalContext : ""
}

describe("native codex assign hook", () => {
  test("injects the Codex startup contract on SessionStart", async () => {
    // Given / When
    const result = await runHook("", "SessionStart")

    // Then
    expect(result.exitCode).toBe(0)
    const context = parseAdditionalContext(result.stdout)
    expect(context).toContain('<lfg-sisyphus-ceo-protocol force="true">')
    expect(context).toContain("lfg --json handoff plan --role coding --engine gpt --focus")
    expect(context).toContain("handoff.launch.argv")
    expect(context).toContain("RESULT")
    expect(context).toContain(LOW_NUDGE_POLICY_TAG)
  })

  test("force-routes plan requests through the external Codex ulw-plan skill", async () => {
    // Given / When
    const result = await runHook("ulw-plan a decision-complete release workflow")

    // Then
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('<lfg-codex-plan-assign force=\\"true\\" skill=\\"ulw-plan\\">')
    expect(result.stdout).toContain("lfg --json plan ulw-plan")
    expect(parseAdditionalContext(result.stdout)).toContain(
      "lfg --json handoff plan --role coding --engine gpt --focus",
    )
  })

  test("registers SessionStart and UserPromptSubmit assign commands once", () => {
    const once = addNativeCodexAssignHooks({})
    const twice = addNativeCodexAssignHooks(once as Record<string, unknown>)
    const userPromptGroups = twice.UserPromptSubmit as unknown[]
    const sessionStartGroups = twice.SessionStart as unknown[]
    expect(sessionStartGroups).toHaveLength(1)
    const groups = userPromptGroups
    const commands = groups.flatMap((group) => {
      if (typeof group !== "object" || group === null) return []
      const hooks = (group as { hooks?: unknown }).hooks
      if (!Array.isArray(hooks)) return []
      return hooks
        .map((h) => (typeof h === "object" && h !== null ? (h as { command?: string }).command : undefined))
        .filter((c): c is string => typeof c === "string")
    })
    expect(commands.filter((c) => c.includes(NATIVE_CODEX_ASSIGN_FILE))).toHaveLength(1)
    expect(commands.some((c) => c.includes(NATIVE_CODEX_ASSIGN_FILE))).toBe(true)
  })

  test("implementation words inject FORCE handoff to Codex", async () => {
    const result = await runHook("please implement the handoff route")
    expect(result.exitCode).toBe(0)
    const context = parseAdditionalContext(result.stdout)
    expect(context).toContain('<lfg-sisyphus-ceo-protocol force="true">')
    expect(context).toContain("intent")
    expect(context).toContain("brief")
    expect(context).toContain("lfg --json handoff plan --role coding --engine gpt --focus")
    expect(context).toContain("handoff.launch.argv")
    expect(context).toContain("RESULT")
    expect(context).toContain(LOW_NUDGE_POLICY_TAG)
  })

  test("image intent forces Codex to load the imagegen skill", async () => {
    // Given / When
    const result = await runHook("draw a logo")

    // Then
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("$imagegen")
  })

  test("any non-trivial prompt forces Codex handoff path", async () => {
    const result = await runHook("look at the install path and tell me what is wrong")
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("FORCE HANDOFF")
    expect(result.stdout).toContain("handoff plan")
  })

  test("start-work intent injects the dedicated Codex skill planner", async () => {
    const result = await runHook("start work on .omo/plans/release.md")
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("lfg --json plan start-work")
    expect(result.stdout).toContain('--plan \\".omo/plans/release.md\\"')
    expect(result.stdout).toContain("$start-work")
    expect(result.stdout).toContain("Prefer the Codex app-server")
    expect(result.stdout).toContain("codex-exec fallback only when the daemon is unavailable")
    expect(result.stdout).not.toContain("Launch the returned Codex argv;")
  })

  test("goal work intent injects a forced Codex goal path", async () => {
    const result = await runHook("/goal ship the release")
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("FORCE HANDOFF")
    expect(result.stdout).toContain("Intent: goal")
    expect(result.stdout).toMatch(/lfg --json (plan goal|handoff plan)/)
    expect(result.stdout).toMatch(/\$(start-work|ulw-loop|ulw-plan)/)
  })

  test("goal clear still injects the forced goal path", async () => {
    const result = await runHook("/goal clear")
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("FORCE HANDOFF")
    expect(result.stdout).toContain("Intent: goal")
    expect(result.stdout).toMatch(/lfg --json (plan goal|handoff plan)/)
    expect(result.stdout).not.toContain("Even for short chat")
  })

  test("ulw-plan intent injects the dedicated Codex planning skill", async () => {
    const result = await runHook("write a plan for the release")
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("lfg --json plan ulw-plan")
    expect(result.stdout).toContain("$ulw-plan")
  })

  test("trivial hi still injects soft CEO lock", async () => {
    const result = await runHook("hello")
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("CEO only")
  })
})
