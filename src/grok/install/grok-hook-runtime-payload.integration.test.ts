import { spawn } from "node:child_process"
import { access, cp, mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { describe, expect, test } from "vitest"
import { runLfg } from "../../cli/test/test-process"

type CommandResult = {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}

describe("fresh Grok hook runtime payload", () => {
  test("normal setup installs behavioral rules and ultrawork hooks instead of fixture markers", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-runtime-payload-home-"))
    const project = await mkdtemp(join(tmpdir(), "lfg-runtime-payload-project-"))
    await mkdir(join(project, "src"), { recursive: true })
    await writeFile(join(project, "AGENTS.md"), "# Runtime rules\n\nUse safe TypeScript.\n", "utf8")

    const setup = await runLfg(["--json", "setup", "--run", "--install-only"], { HOME: home })
    expect(setup.exitCode).toBe(0)

    const pluginRoot = join(home, ".grok", "plugins", "lfg")
    const rules = await runInstalledHook(join(pluginRoot, "hooks", "lfg-native-rules.mjs"), "session-start", {
      hookEventName: "SessionStart",
      cwd: project,
      sessionId: "rules-runtime",
    }, pluginRoot)
    const ultrawork = await runInstalledHook(join(pluginRoot, "hooks", "lfg-native-ultrawork.mjs"), "user-prompt-submit", {
      hookEventName: "UserPromptSubmit",
      cwd: project,
      sessionId: "ultrawork-runtime",
      prompt: "enable ultrawork for this task",
    }, pluginRoot)

    expect(rules.exitCode).toBe(0)
    expect(rules.stdout).not.toContain("lfg fixture rules-context-ok")
    expect(rules.stdout).toContain("Use safe TypeScript.")
    expect(ultrawork.exitCode).toBe(0)
    expect(ultrawork.stdout).not.toContain("lfg fixture ultrawork-directive-ok")
    expect(ultrawork.stdout).toContain("<ultrawork-mode>")
    await expect(access(join(pluginRoot, "fixture"))).rejects.toThrow()
  }, 15_000)

  test("fixture markers remain available only from the explicit fixture component source", async () => {
    const rules = await runComponent(join(process.cwd(), "src", "grok", "fixture", "components", "rules", "dist", "cli.js"), {
      hook_event_name: "SessionStart",
    })

    expect(rules.exitCode).toBe(0)
    expect(rules.stdout).toContain("lfg fixture rules-context-ok")
  })

  test("normal non-force setup repairs a stamped fixture plugin with behavioral hook runtimes", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-runtime-repair-home-"))
    const project = await mkdtemp(join(tmpdir(), "lfg-runtime-repair-project-"))
    const pluginRoot = join(home, ".grok", "plugins", "lfg")
    await mkdir(join(project, "src"), { recursive: true })
    await writeFile(join(project, "AGENTS.md"), "# Repair rules\n\nRepair stale hook payloads.\n", "utf8")
    await cp(join(process.cwd(), "src", "grok", "fixture"), pluginRoot, { recursive: true })
    await writeFile(join(pluginRoot, "lfg-install.json"), '{"packageName":"@islee23520/lfg","version":"stale"}\n', "utf8")

    const setup = await runLfg(["--json", "setup", "--run"], { HOME: home })
    expect(setup.exitCode).toBe(0)

    const rules = await runInstalledHook(join(pluginRoot, "hooks", "lfg-native-rules.mjs"), "session-start", {
      hookEventName: "SessionStart",
      cwd: project,
      sessionId: "repair-rules",
    }, pluginRoot)
    const ultrawork = await runInstalledHook(join(pluginRoot, "hooks", "lfg-native-ultrawork.mjs"), "user-prompt-submit", {
      hookEventName: "UserPromptSubmit",
      cwd: project,
      sessionId: "repair-ultrawork",
      prompt: "enable ultrawork to repair the plugin",
    }, pluginRoot)

    expect(rules.exitCode).toBe(0)
    expect(rules.stdout).not.toContain("lfg fixture rules-context-ok")
    expect(rules.stdout).toContain("Repair stale hook payloads.")
    expect(ultrawork.exitCode).toBe(0)
    expect(ultrawork.stdout).not.toContain("lfg fixture ultrawork-directive-ok")
    expect(ultrawork.stdout).toContain("<ultrawork-mode>")
  }, 20_000)

  test("normal setup registers and runs documented native rules hook events", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-runtime-rules-events-home-"))
    const project = await mkdtemp(join(tmpdir(), "lfg-runtime-rules-events-project-"))
    const pluginRoot = join(home, ".grok", "plugins", "lfg")
    await mkdir(join(project, "src"), { recursive: true })
    await writeFile(join(project, "AGENTS.md"), "# Event rules\n\nApply event rule context.\n", "utf8")
    await writeFile(join(project, "src", "edited.ts"), "export const edited = true\n", "utf8")

    const setup = await runLfg(["--json", "setup", "--run", "--install-only"], { HOME: home })
    expect(setup.exitCode).toBe(0)

    const activeHooks = await readFile(join(home, ".grok", "hooks", "lfg-hooks.json"), "utf8")
    expect(activeHooks).toContain("lfg-native-rules.mjs' session-start")
    expect(activeHooks).toContain("lfg-native-rules.mjs' user-prompt-submit")
    expect(activeHooks).toMatch(/"matcher": "\^apply_patch\$"[\s\S]*lfg-native-rules\.mjs' post-tool-use/)
    expect(activeHooks).toMatch(/"matcher": "manual\|auto"[\s\S]*lfg-native-rules\.mjs' post-compact/)

    const userPrompt = await runInstalledHook(join(pluginRoot, "hooks", "lfg-native-rules.mjs"), "user-prompt-submit", {
      hookEventName: "UserPromptSubmit",
      cwd: project,
      sessionId: "event-prompt",
      prompt: "use rules",
    }, pluginRoot)
    const postTool = await runInstalledHook(join(pluginRoot, "hooks", "lfg-native-rules.mjs"), "post-tool-use", {
      hookEventName: "PostToolUse",
      cwd: project,
      sessionId: "event-tool",
      toolName: "apply_patch",
      toolInput: { filePath: join(project, "src", "edited.ts") },
    }, pluginRoot)
    const postCompact = await runInstalledHook(join(pluginRoot, "hooks", "lfg-native-rules.mjs"), "post-compact", {
      hookEventName: "PostCompact",
      cwd: project,
      sessionId: "event-compact",
      trigger: "manual",
    }, pluginRoot)

    for (const result of [userPrompt, postTool, postCompact]) {
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain("Apply event rule context.")
    }
  }, 20_000)
})

function runInstalledHook(
  hook: string,
  event: string,
  payload: Record<string, unknown>,
  pluginRoot: string,
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [hook, event], {
      env: { ...process.env, GROK_PLUGIN_ROOT: pluginRoot },
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
    child.stdin.end(JSON.stringify(payload))
    child.on("close", (code) => resolve({ exitCode: code ?? 1, stdout, stderr }))
    child.on("error", () => resolve({ exitCode: 1, stdout, stderr }))
  })
}

function runComponent(component: string, payload: Record<string, unknown>): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [component, "hook", "session-start"], {
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
    child.stdin.end(JSON.stringify(payload))
    child.on("close", (code) => resolve({ exitCode: code ?? 1, stdout, stderr }))
    child.on("error", () => resolve({ exitCode: 1, stdout, stderr }))
  })
}
