import { spawn } from "node:child_process"
import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { runLfg } from "../bin/test-process"

describe("installed project .omo loader runtime", () => {
  test("setup --run installs loader that reads valid and malformed project .omo fail-closed", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-omo-runtime-home-"))
    const projectRoot = await mkdtemp(join(tmpdir(), "lfg-omo-runtime-project-"))
    const malformedRoot = await mkdtemp(join(tmpdir(), "lfg-omo-runtime-malformed-"))
    await writeProjectOmo(projectRoot, "runtime-session")
    await mkdir(join(malformedRoot, ".omo"), { recursive: true })
    await writeFile(join(malformedRoot, ".omo", "boulder.json"), "{bad", "utf8")

    const setup = await runLfg(["--json", "setup", "--run"], { HOME: home })
    expect(setup.exitCode).toBe(0)
    expect(setup.json).toMatchObject({ ok: true, command: "setup", executed: true, installPath: "grok" })

    const loader = join(home, ".grok", "plugins", "lfg", "hooks", "lfg-config-loader.mjs")
    const valid = await runInstalledLoader(loader, home, {
      hookEventName: "session_start",
      sessionId: "runtime-session",
      cwd: projectRoot,
    })
    expect(valid).toMatchObject({ exitCode: 0, stderr: "" })
    expect(valid.stdout).toContain("LFG project .omo ledger loaded from")
    expect(valid.stdout).toContain("Active work: runtime-work")
    expect(valid.stdout).toContain("Ledger line count: 2")
    expect(valid.stdout).not.toContain("secret evidence line")

    const malformed = await runInstalledLoader(loader, home, {
      hookEventName: "UserPromptSubmit",
      sessionId: "runtime-session",
      cwd: malformedRoot,
    })
    expect(malformed).toMatchObject({ exitCode: 0, stderr: "" })
    expect(malformed.stdout).not.toContain("LFG project .omo ledger loaded from")
    expect(malformed.stdout).not.toContain("bad")
  })

  test("UserPromptSubmit loader path emits ultrawork directive and ulw-loop summary when present", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-omo-ulw-runtime-"))
    const projectRoot = await mkdtemp(join(tmpdir(), "lfg-omo-ulw-project-"))
    await writeProjectOmo(projectRoot, "ulw-session")
    // seed a real ulw-loop session with ledger
    await mkdir(join(projectRoot, ".omo", "ulw-loop", "019e9705-2774-7683-a928-73d4d7755386"), { recursive: true })
    await writeFile(join(projectRoot, ".omo", "ulw-loop", "019e9705-2774-7683-a928-73d4d7755386", "ledger.jsonl"), "evidence line\n", "utf8")

    const setup = await runLfg(["--json", "setup", "--run"], { HOME: home })
    expect(setup.exitCode).toBe(0)

    const loader = join(home, ".grok", "plugins", "lfg", "hooks", "lfg-config-loader.mjs")
    const prompt = await runInstalledLoader(loader, home, {
      hookEventName: "UserPromptSubmit",
      sessionId: "ulw-session",
      cwd: projectRoot,
      prompt: "do the work",
    })
    expect(prompt).toMatchObject({ exitCode: 0, stderr: "" })
    expect(prompt.stdout).toContain("ulw-loop sessions: 1")
    expect(prompt.stdout).toContain("ulw-loop has active ledger: true")
  })
})

type LoaderResult = {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}

async function writeProjectOmo(projectRoot: string, sessionId: string): Promise<void> {
  await mkdir(join(projectRoot, ".omo", "start-work"), { recursive: true })
  await writeFile(
    join(projectRoot, ".omo", "boulder.json"),
    `${JSON.stringify(
      {
        schema_version: 2,
        active_work_id: "runtime-work",
        works: {
          "runtime-work": {
            work_id: "runtime-work",
            active_plan: ".omo/plans/runtime.md",
            plan_name: "Runtime Plan",
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
  await writeFile(
    join(projectRoot, ".omo", "start-work", "ledger.jsonl"),
    "secret evidence line one\nsecret evidence line two\n",
    "utf8",
  )
}

function runInstalledLoader(
  loader: string,
  home: string,
  payload: Record<string, string>,
): Promise<LoaderResult> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [loader], {
      env: { ...process.env, HOME: home },
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
    child.stdin.write(JSON.stringify(payload))
    child.stdin.end()
    child.on("close", (code) => resolve({ exitCode: code ?? 1, stdout, stderr }))
    child.on("error", () => resolve({ exitCode: 1, stdout, stderr }))
  })
}
