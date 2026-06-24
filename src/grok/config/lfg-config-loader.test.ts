import { spawn } from "node:child_process"
import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"

const loaderPath = join(import.meta.dirname, "..", "assets", "config", "lfg-config-loader.mjs")

describe("lfg-config-loader project .omo context", () => {
  test("emits global config and concise project .omo summary for SessionStart", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-loader-home-"))
    const projectRoot = await mkdtemp(join(tmpdir(), "lfg-loader-project-"))
    await writeGlobalConfig(home)
    await writeProjectOmo(projectRoot, "session-123", ["ledger one", "ledger two"])

    const result = await runLoader({
      home,
      payload: {
        hookEventName: "session_start",
        sessionId: "session-123",
        cwd: projectRoot,
      },
    })

    expect(result).toMatchObject({ exitCode: 0, stderr: "" })
    const output = parseHookOutput(result.stdout)
    expect(output.statusMessage).toContain("LFG:")
    expect(output.hookSpecificOutput?.hookEventName).toBe("SessionStart")
    expect(output.hookSpecificOutput?.additionalContext).toContain("LFG global config loaded from")
    expect(output.hookSpecificOutput?.additionalContext).toContain("Configured LFG agents: reviewer.")
    expect(output.hookSpecificOutput?.additionalContext).toContain(
      `LFG project .omo ledger loaded from ${join(projectRoot, ".omo", "boulder.json")}.`,
    )
    expect(output.hookSpecificOutput?.additionalContext).toContain("Active work: demo-work")
    expect(output.hookSpecificOutput?.additionalContext).toContain("Plan: Demo Plan")
    expect(output.hookSpecificOutput?.additionalContext).toContain("Status: active")
    expect(output.hookSpecificOutput?.additionalContext).toContain("Active plan: .omo/plans/demo.md")
    expect(output.hookSpecificOutput?.additionalContext).toContain("Ledger exists: true")
    expect(output.hookSpecificOutput?.additionalContext).toContain("Ledger line count: 2")
    expect(output.hookSpecificOutput?.additionalContext).toContain("Previous OMO context: awareness-only; continuation remains Deferred.")
    expect(output.hookSpecificOutput?.additionalContext).toContain("Resumable awareness: demo-work (Demo Plan, active, sessions=1)")
    expect(output.hookSpecificOutput?.additionalContext).toContain("Ledger preview: start-work, lines=2")
    expect(output.hookSpecificOutput?.additionalContext).not.toContain("ledger one")
    expect(output.hookSpecificOutput?.additionalContext).not.toContain("ledger two")
    expect(output.hookSpecificOutput?.additionalContext).toContain("ulw-loop: none")
    expect(output.hookSpecificOutput?.additionalContext.length).toBeLessThanOrEqual(2048)
  })

  test("omits secret-like ledger text from rendered project .omo awareness", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-loader-secret-home-"))
    const projectRoot = await mkdtemp(join(tmpdir(), "lfg-loader-secret-project-"))
    await writeProjectOmo(projectRoot, "session-123", [
      '{"api_key":"sk-test-secret","prompt":"do not leak this prompt"}',
      "Authorization: Bearer abcdefghijklmnopqrstuvwxyz",
    ])

    const result = await runLoader({
      home,
      payload: {
        hookEventName: "session_start",
        sessionId: "session-123",
        cwd: projectRoot,
      },
    })

    expect(result).toMatchObject({ exitCode: 0, stderr: "" })
    const context = parseHookOutput(result.stdout).hookSpecificOutput?.additionalContext ?? ""
    expect(context).toContain("Ledger preview: start-work, lines=2")
    expect(context).not.toContain("sk-test-secret")
    expect(context).not.toContain("Authorization")
    expect(context).not.toContain("do not leak this prompt")
  })

  test("redacts secret-like boulder metadata and caps project context", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-loader-boulder-secret-home-"))
    const projectRoot = await mkdtemp(join(tmpdir(), "lfg-loader-boulder-secret-project-"))
    const longActivePlan = `.omo/plans/${"x".repeat(4096)}.md`
    await writeProjectOmoCustom(projectRoot, {
      work_id: "demo-work",
      active_plan: longActivePlan,
      plan_name: "sk-test-secret do not leak this prompt",
      session_ids: ["grok:session-123"],
      status: "Authorization: Bearer abcdefghijklmnopqrstuvwxyz",
      worktree_path: "/tmp/project token=secret-value",
    }, ["safe ledger line"])

    const result = await runLoader({
      home,
      payload: {
        hookEventName: "session_start",
        sessionId: "session-123",
        cwd: projectRoot,
      },
    })

    expect(result).toMatchObject({ exitCode: 0, stderr: "" })
    const context = parseHookOutput(result.stdout).hookSpecificOutput?.additionalContext ?? ""
    expect(context.length).toBeLessThanOrEqual(2048)
    expect(context).toContain("Plan: [redacted]")
    expect(context).toContain("Status: [redacted]")
    expect(context).toContain("Worktree: [redacted]")
    expect(context).not.toContain("sk-test-secret")
    expect(context).not.toContain("Authorization")
    expect(context).not.toContain("Bearer")
    expect(context).not.toContain(longActivePlan)
    expect(context).not.toContain("do not leak this prompt")
  })

  test("fails closed for malformed project .omo", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-loader-malformed-home-"))
    const projectRoot = await mkdtemp(join(tmpdir(), "lfg-loader-malformed-project-"))
    await mkdir(join(projectRoot, ".omo"), { recursive: true })
    await writeFile(join(projectRoot, ".omo", "boulder.json"), "{broken", "utf8")

    const result = await runLoader({
      home,
      payload: {
        hookEventName: "UserPromptSubmit",
        sessionId: "session-123",
        workspaceRoot: projectRoot,
      },
    })

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("LFG-OMO-LEDGER-ERROR")
    expect(result.stderr).toContain(join(projectRoot, ".omo", "boulder.json"))
    expect(result.stdout).toBe("")
  })
})

type ParsedHookOutput = {
  readonly statusMessage?: string
  readonly hookSpecificOutput?: {
    readonly hookEventName: string
    readonly additionalContext: string
  }
}

type LoaderResult = {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}

type ProjectOmoFixtureWork = {
  readonly work_id: string
  readonly active_plan: string
  readonly plan_name: string
  readonly session_ids: readonly string[]
  readonly status: string
  readonly worktree_path: string | null
}

async function writeGlobalConfig(home: string): Promise<void> {
  await mkdir(join(home, ".grok"), { recursive: true })
  await writeFile(
    join(home, ".grok", "lfg-config.jsonc"),
    '{\n  "agents": { "reviewer": { "model": "grok-build", "enabled": true } }\n}\n',
    "utf8",
  )
}

async function writeProjectOmo(projectRoot: string, sessionId: string, ledgerLines: readonly string[]): Promise<void> {
  await writeProjectOmoCustom(projectRoot, {
    work_id: "demo-work",
    active_plan: ".omo/plans/demo.md",
    plan_name: "Demo Plan",
    session_ids: [`grok:${sessionId}`],
    status: "active",
    worktree_path: null,
  }, ledgerLines)
}

async function writeProjectOmoCustom(
  projectRoot: string,
  work: ProjectOmoFixtureWork,
  ledgerLines: readonly string[],
): Promise<void> {
  await mkdir(join(projectRoot, ".omo", "start-work"), { recursive: true })
  await writeFile(
    join(projectRoot, ".omo", "boulder.json"),
    `${JSON.stringify(
      {
        schema_version: 2,
        active_work_id: "demo-work",
        works: { "demo-work": work },
      },
      null,
      2,
    )}\n`,
    "utf8",
  )
  await writeFile(join(projectRoot, ".omo", "start-work", "ledger.jsonl"), `${ledgerLines.join("\n")}\n`, "utf8")
}

function parseHookOutput(stdout: string): ParsedHookOutput {
  const parsed: unknown = JSON.parse(stdout.trim())
  if (!isHookOutput(parsed)) {
    throw new TypeError(`loader stdout was not valid hook output: ${stdout}`)
  }
  return parsed
}

function isHookOutput(value: unknown): value is ParsedHookOutput {
  if (typeof value !== "object" || value === null) return false
  const record = value as { readonly [key: string]: unknown }
  const hasStatus = typeof record.statusMessage === "string"
  const hookSpecificOutput = record.hookSpecificOutput
  const hasHookOutput = "hookSpecificOutput" in value &&
    typeof hookSpecificOutput === "object" &&
    hookSpecificOutput !== null
  return hasStatus || hasHookOutput
}

function runLoader(options: { readonly home: string; readonly payload: Record<string, string> }): Promise<LoaderResult> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [loaderPath], {
      env: { ...process.env, HOME: options.home, LFG_ALLOW_TEST_GROK_HOME: "1" },
      stdio: ["pipe", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.stdin.write(JSON.stringify(options.payload))
    child.stdin.end()
    child.on("close", (code) => resolve({ exitCode: code ?? 1, stdout, stderr }))
    child.on("error", () => resolve({ exitCode: 1, stdout, stderr }))
  })
}
