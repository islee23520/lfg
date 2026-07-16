import { spawn } from "node:child_process"
import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"
import { addNativeCodexAssignHooks, NATIVE_CODEX_ASSIGN_FILE } from "./native-codex-assign-hook-registration"

const hookPath = join(dirname(fileURLToPath(import.meta.url)), "..", "assets", "hooks", NATIVE_CODEX_ASSIGN_FILE)
const LOW_NUDGE_POLICY_TAG = '<lfg-sisyphus-low-nudge-policy mode="terminal-only">'

async function runHook(
  prompt: string,
  hookEventName = "UserPromptSubmit",
  env: Readonly<Record<string, string>> = {},
): Promise<{ exitCode: number; stdout: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [hookPath], {
      env: { ...process.env, LFG_CODEX_ASSIGN_AUTO_EXECUTE: "0", ...env },
      stdio: ["pipe", "pipe", "pipe"],
    })
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

async function createFakeLfg(): Promise<{ readonly binary: string; readonly argvPath: string }> {
  const root = await mkdtemp(join(tmpdir(), "lfg-codex-assign-auto-"))
  const binary = join(root, "lfg-fake")
  const argvPath = join(root, "argv.json")
  // goal drive primary path: ok + goal_driven + monitor.attached
  await writeFile(
    binary,
    `#!/bin/sh
printf '%s\\n' "$@" > "${argvPath}"
printf '%s\\n' '{"ok":true,"status":"goal_driven","transport":"app-server","threadId":"thread-auto-1","monitor":{"attached":true,"boardPath":".omo/orchestrator/monitor-board.json"}}'
`,
    "utf8",
  )
  await chmod(binary, 0o755)
  return { binary, argvPath }
}

async function createPlanMissingFakeLfg(): Promise<{ readonly binary: string; readonly argvPath: string }> {
  const root = await mkdtemp(join(tmpdir(), "lfg-codex-assign-plan-missing-"))
  const binary = join(root, "lfg-fake")
  const argvPath = join(root, "argv.txt")
  await writeFile(
    binary,
    `#!/bin/sh
printf '%s\n' "$*" >> "${argvPath}"
case "$*" in
  *"ulw-loop create-goals"*) printf '%s\n' '{"ok":true,"status":"created"}' ;;
  *)
    if [ "$(wc -l < "${argvPath}")" -eq 1 ]; then
      printf '%s\n' '{"ok":false,"status":"invalid_goal_plan","error":"ULW_LOOP_PLAN_MISSING"}'
    else
      printf '%s\n' '{"ok":true,"status":"goal_driven","transport":"app-server","threadId":"thread-retry-1","monitor":{"attached":true}}'
    fi
    ;;
esac
`,
    "utf8",
  )
  await chmod(binary, 0o755)
  return { binary, argvPath }
}

describe("native codex assign hook", () => {
  test("auto goal-drives Codex via ulw-loop with monitor attach", async () => {
    // Given
    const { binary, argvPath } = await createFakeLfg()
    const projectRoot = dirname(binary)

    // When
    const result = await runHook("implement automatic orchestration", "UserPromptSubmit", {
      LFG_CODEX_ASSIGN_AUTO_EXECUTE: "1",
      LFG_CLI_BINARY: binary,
      LFG_HOOK_PROJECT_ROOT: projectRoot,
    })

    // Then
    expect(result.exitCode).toBe(0)
    expect((await readFile(argvPath, "utf8")).trim().split("\n")).toEqual([
      "--json",
      "goal",
      "drive",
      "--skill",
      "ulw-loop",
      "--skill",
      "programming",
      "--focus",
      "implement automatic orchestration",
      "--cwd",
      projectRoot,
    ])
    expect(JSON.parse(result.stdout)).toMatchObject({
      autoHandoff: {
        attempted: true,
        ok: true,
        status: "goal_driven",
        transport: "app-server",
        threadId: "thread-auto-1",
        monitor: { attached: true },
      },
    })
    expect(parseAdditionalContext(result.stdout)).toContain(
      '<lfg-auto-goal status="executed" thread_id="thread-auto-1" monitor="attached"',
    )
    expect(parseAdditionalContext(result.stdout)).toContain("ALREADY EXECUTED via goal drive + ulw-loop")
    await expect(
      readFile(join(projectRoot, ".omo", "orchestrator", "auto-goal-receipt.json"), "utf8"),
    ).resolves.toContain("thread-auto-1")
  })

  test("creates the current session goals before retrying goal drive", async () => {
    const { binary, argvPath } = await createPlanMissingFakeLfg()
    const projectRoot = dirname(binary)

    const result = await runHook("implement session-scoped orchestration", "UserPromptSubmit", {
      LFG_CODEX_ASSIGN_AUTO_EXECUTE: "1",
      LFG_CLI_BINARY: binary,
      LFG_HOOK_PROJECT_ROOT: projectRoot,
      LFG_ULW_LOOP_SESSION_ID: "session-123",
    })

    expect(result.exitCode).toBe(0)
    const calls = (await readFile(argvPath, "utf8")).trim().split("\n")
    expect(calls).toHaveLength(3)
    expect(calls[1]).toContain("ulw-loop create-goals")
    expect(calls[1]).toContain("--session-id session-123")
    expect(calls[2]).toContain("goal drive --skill ulw-loop --skill programming")
    expect(JSON.parse(result.stdout)).toMatchObject({
      autoHandoff: { ok: true, status: "goal_driven", threadId: "thread-retry-1", monitor: { attached: true } },
    })
  })

  test("resolves the installed ~/.grok/bin/lfg wrapper when lfg is absent from PATH", async () => {
    const root = await mkdtemp(join(tmpdir(), "lfg-codex-assign-home-bin-"))
    const binary = join(root, ".grok", "bin", "lfg")
    const argvPath = join(root, "argv.txt")
    await import("node:fs/promises").then(({ mkdir }) => mkdir(dirname(binary), { recursive: true }))
    await writeFile(
      binary,
      `#!/bin/sh\nprintf '%s\\n' "$@" > "${argvPath}"\nprintf '%s\\n' '{"ok":true,"status":"goal_driven","transport":"app-server","threadId":"thread-home-1","monitor":{"attached":true}}'\n`,
      "utf8",
    )
    await chmod(binary, 0o755)

    const result = await runHook("repair the hook plane", "UserPromptSubmit", {
      HOME: root,
      PATH: "/usr/bin:/bin",
      LFG_CODEX_ASSIGN_AUTO_EXECUTE: "1",
      LFG_CLI_BINARY: "",
      LFG_HOOK_PROJECT_ROOT: root,
    })

    expect(result.exitCode).toBe(0)
    const argv = await readFile(argvPath, "utf8")
    expect(argv).toContain("goal")
    expect(argv).toContain("drive")
    expect(argv).toContain("ulw-loop")
    expect(JSON.parse(result.stdout)).toMatchObject({ autoHandoff: { ok: true, status: "goal_driven" } })
  })

  test("does not auto-execute Codex when clearing the display goal", async () => {
    // Given
    const { binary, argvPath } = await createFakeLfg()

    // When
    const result = await runHook("/goal clear", "UserPromptSubmit", {
      LFG_CODEX_ASSIGN_AUTO_EXECUTE: "1",
      LFG_CLI_BINARY: binary,
    })

    // Then
    await expect(readFile(argvPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" })
    expect(JSON.parse(result.stdout)).toMatchObject({
      autoHandoff: { attempted: false, ok: false, status: "skipped", transport: null, reason: "goal_clear" },
    })
    expect(parseAdditionalContext(result.stdout)).toContain('<lfg-codex-goal-clear skip="true">')
    expect(parseAdditionalContext(result.stdout)).not.toContain("MUST run: lfg --json plan goal")
  })

  test("injects the Codex startup contract on SessionStart", async () => {
    // Given / When
    const result = await runHook("", "SessionStart")

    // Then
    expect(result.exitCode).toBe(0)
    const context = parseAdditionalContext(result.stdout)
    expect(context).toContain('<lfg-sisyphus-ceo-protocol force="true">')
    expect(context).toContain('lfg --json goal drive --skill ulw-loop --skill programming --focus')
    expect(context).toContain("goal board")
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
      "lfg --json goal drive --skill ulw-loop --skill programming --focus",
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
    expect(JSON.stringify(groups)).toContain('"timeout":120')
  })

  test("implementation words inject FORCE handoff to Codex", async () => {
    const result = await runHook("please implement the handoff route")
    expect(result.exitCode).toBe(0)
    const context = parseAdditionalContext(result.stdout)
    expect(context).toContain('<lfg-sisyphus-ceo-protocol force="true">')
    expect(context).toContain("intent")
    expect(context).toContain("brief")
    expect(context).toContain("lfg --json goal drive --skill ulw-loop --skill programming --focus")
    expect(context).toContain("goal board")
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
    expect(result.stdout).toContain("goal drive")
    expect(result.stdout).toContain("ulw-loop")
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
    expect(result.stdout).toContain("MUST run: lfg --json goal drive --skill ulw-loop --skill programming")
    expect(result.stdout).toContain("monitor")
    expect(result.stdout).toContain("display-only")
    expect(result.stdout).toMatch(/\$ulw-loop/)
  })

  test("goal clear still injects the forced goal path", async () => {
    const result = await runHook("/goal clear")
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('<lfg-codex-goal-clear skip=\\"true\\">')
    expect(result.stdout).not.toContain("MUST run: lfg --json goal drive")
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
