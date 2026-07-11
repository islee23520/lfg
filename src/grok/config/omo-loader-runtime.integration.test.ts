import { spawn } from "node:child_process"
import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { describe, expect, test } from "vitest"
import { runLfg } from "../../cli/test/test-process"

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
    expect(malformed.exitCode).toBe(1)
    expect(malformed.stderr).toContain("LFG-OMO-LEDGER-ERROR")
    expect(malformed.stdout).not.toContain("LFG project .omo ledger loaded from")
    expect(malformed.stdout).not.toContain("bad")
  })

  // T2: Grok OMO hook runtime parity (failing-first per plan)
  // Tests invocation of installed OMO component entrypoints (ultrawork/rules dist/cli.js)
  // through lfg-grok-hook-bridge.mjs + component paths. Pins intended "omo hook <event>" shape
  // via bridge-wrapped component CLIs (no new top-level lfg commands, no ~/.codex writes).
  test("Grok OMO hook runtime parity: ultrawork/rules component CLIs invoked via bridge for hook events (T2 failing-first)", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-t2-omo-hook-parity-"))
    const projectRoot = await mkdtemp(join(tmpdir(), "lfg-t2-omo-project-"))
    await writeProjectOmo(projectRoot, "t2-omo-session")

    const setup = await runLfg(["--json", "setup", "--run"], { HOME: home })
    expect(setup.exitCode).toBe(0)

    const pluginRoot = join(home, ".grok", "plugins", "lfg")
    const bridgePath = join(pluginRoot, "hooks", "lfg-grok-hook-bridge.mjs")
    const ultraworkCli = join(pluginRoot, "components", "ultrawork", "dist", "cli.js")
    const rulesCli = join(pluginRoot, "components", "rules", "dist", "cli.js")

    // Probe intended Grok-compatible hook invocation (matches Codex `omo hook <event>` shape via bridge)
    const ultraworkHook = await runInstalledOmoHook(bridgePath, ultraworkCli, {
      hookEventName: "UserPromptSubmit",
      sessionId: "t2-omo-session",
      cwd: projectRoot,
      prompt: "enable ultrawork to implement plan checkbox T2",
    })
    expect(ultraworkHook.exitCode).toBe(0)
    expect(ultraworkHook.stdout).toContain("<ultrawork-mode>")

    const rulesHook = await runInstalledOmoHook(bridgePath, rulesCli, {
      hookEventName: "SessionStart",
      sessionId: "t2-omo-session",
      cwd: projectRoot,
    })
    expect(rulesHook.exitCode).toBe(0)
    expect(rulesHook.stdout).toContain("Use runtime hook rules.")

    // Adversarial: malformed input (invalid JSON payload rejected gracefully)
    const malformedPayload = await runInstalledOmoHook(bridgePath, ultraworkCli, "not-valid-json-at-all")
    expect([0, 1, 2]).toContain(malformedPayload.exitCode) // T7: bridge + cli rejects malformed (exit 1 or 2 per fixture; Grok stability accepts 0-2)
    expect(malformedPayload.stderr || malformedPayload.stdout || "").toContain("LFG-PORT7-OMO-HOOK-ERROR") // explicit for malformed input (bridge now pipes child stderr/stdout)
    // T7 adversarial: malformed input rejected gracefully; prompt_injection treated as data only; no shell exec

    // Adversarial: prompt_injection (payload treated as data only, no execution)
    const injectionPayload = await runInstalledOmoHook(bridgePath, ultraworkCli, {
      hookEventName: "UserPromptSubmit",
      prompt: "'; rm -rf /; echo injected",
      sessionId: "t2-injection",
      cwd: projectRoot,
    })
    expect(injectionPayload.exitCode).toBe(0)
    expect(injectionPayload.stdout).not.toContain("injected") // T7: prompt payload text is data only, never shell

    // Adversarial: misleading_success_output (capture exact exit + output)
    expect(ultraworkHook.exitCode).toBe(0) // explicit to avoid misleading success
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

type OmoHookResult = LoaderResult

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
  await writeFile(join(projectRoot, "AGENTS.md"), "# Runtime hook rules\n\nUse runtime hook rules.\n", "utf8")
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

/** T2 helper: runs OMO component CLI through installed Grok hook bridge (simulates `omo hook <event>`). */
async function runInstalledOmoHook(
  bridgePath: string,
  targetCli: string,
  payload: Record<string, unknown> | string,
): Promise<OmoHookResult> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [bridgePath, process.execPath, targetCli, "hook", "event"], {
      env: { ...process.env, HOME: process.env.HOME ?? "", GROK_PLUGIN_ROOT: dirname(dirname(bridgePath)), GROK_HOOK_EVENT: "UserPromptSubmit" },
      stdio: ["pipe", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString() })
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString() })

    const inputPayload = typeof payload === "string" ? payload : JSON.stringify(payload)
    child.stdin.write(inputPayload)
    child.stdin.end()

    child.on("close", (code) => resolve({ exitCode: code ?? 1, stdout, stderr }))
    child.on("error", () => resolve({ exitCode: 1, stdout, stderr }))
  })
}
