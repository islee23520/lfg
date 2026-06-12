import { spawn } from "node:child_process"
import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"

const loaderPath = join(import.meta.dirname, "assets", "lfg-config-loader.mjs")

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
    expect(output.hookSpecificOutput.hookEventName).toBe("SessionStart")
    expect(output.hookSpecificOutput.additionalContext).toContain("LFG global config loaded from")
    expect(output.hookSpecificOutput.additionalContext).toContain("Configured LFG agents: reviewer.")
    expect(output.hookSpecificOutput.additionalContext).toContain(
      `LFG project .omo ledger loaded from ${join(projectRoot, ".omo", "boulder.json")}.`,
    )
    expect(output.hookSpecificOutput.additionalContext).toContain("Active work: demo-work")
    expect(output.hookSpecificOutput.additionalContext).toContain("Plan: Demo Plan")
    expect(output.hookSpecificOutput.additionalContext).toContain("Status: active")
    expect(output.hookSpecificOutput.additionalContext).toContain("Active plan: .omo/plans/demo.md")
    expect(output.hookSpecificOutput.additionalContext).toContain("Ledger exists: true")
    expect(output.hookSpecificOutput.additionalContext).toContain("Ledger line count: 2")
    expect(output.hookSpecificOutput.additionalContext).not.toContain("ledger one")
    expect(output.hookSpecificOutput.additionalContext).not.toContain("ledger two")
    expect(output.hookSpecificOutput.additionalContext).toContain("ulw-loop: none")
  })

  test("normalizes UserPromptSubmit and fails closed for malformed project .omo", async () => {
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

    expect(result).toMatchObject({ exitCode: 0, stdout: "", stderr: "" })
  })
})

type HookOutput = {
  readonly hookSpecificOutput: {
    readonly hookEventName: string
    readonly additionalContext: string
  }
}

type LoaderResult = {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
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
  await mkdir(join(projectRoot, ".omo", "start-work"), { recursive: true })
  await writeFile(
    join(projectRoot, ".omo", "boulder.json"),
    `${JSON.stringify(
      {
        schema_version: 2,
        active_work_id: "demo-work",
        works: {
          "demo-work": {
            work_id: "demo-work",
            active_plan: ".omo/plans/demo.md",
            plan_name: "Demo Plan",
            session_ids: [`grok:${sessionId}`],
            status: "active",
            worktree_path: null,
          },
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  )
  await writeFile(join(projectRoot, ".omo", "start-work", "ledger.jsonl"), `${ledgerLines.join("\n")}\n`, "utf8")
}

function parseHookOutput(stdout: string): HookOutput {
  const parsed: unknown = JSON.parse(stdout)
  if (!isHookOutput(parsed)) {
    throw new TypeError("loader stdout was not hookSpecificOutput JSON")
  }
  return parsed
}

function isHookOutput(value: unknown): value is HookOutput {
  if (typeof value !== "object" || value === null || !("hookSpecificOutput" in value)) return false
  const output = value.hookSpecificOutput
  if (typeof output !== "object" || output === null) return false
  return "hookEventName" in output && "additionalContext" in output
}

function runLoader(options: { readonly home: string; readonly payload: Record<string, string> }): Promise<LoaderResult> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [loaderPath], {
      env: { ...process.env, HOME: options.home },
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
