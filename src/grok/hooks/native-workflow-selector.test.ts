import { spawn } from "node:child_process"
import { mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { runLfg } from "../../cli/test/test-process"

type HookResult = {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}

const SOURCE_SELECTOR = join(import.meta.dirname, "..", "assets", "hooks", "lfg-native-workflow-selector.mjs")

describe("native Grok workflow selector", () => {
  test("given auto workflow is disabled when a debugging prompt arrives then the selector stays quiet", async () => {
    const result = await runSelector({ prompt: "Fix this flaky test and diagnose why CI is failing" })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe("")
  })

  test("given auto workflow is enabled when a debugging prompt arrives then the selector injects ulw-loop guidance", async () => {
    const result = await runSelector(
      { prompt: "Fix this flaky test and diagnose why CI is failing" },
      { OMO_CODEX_AUTO_WORKFLOW: "1" },
    )

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("<lazycodex-auto-workflow>")
    expect(result.stdout).toContain("$ulw-loop")
    expect(result.stdout).toContain("manual QA evidence")
  })

  test("given an explicit workflow command when auto workflow is enabled then the selector stays quiet", async () => {
    const result = await runSelector(
      { prompt: "$ulw-plan refactor auth" },
      { OMO_CODEX_AUTO_WORKFLOW: "true" },
    )

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe("")
  })

  test("given context pressure when auto workflow is enabled then the selector stays quiet", async () => {
    const result = await runSelector(
      { prompt: "Fix this failing test after the context was compacted" },
      { OMO_CODEX_AUTO_WORKFLOW: "yes" },
    )

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe("")
  })

  test("given malformed input when the selector runs then it fails closed without output", async () => {
    const result = await runSelectorRaw("{not-json", { OMO_CODEX_AUTO_WORKFLOW: "on" })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe("")
  })

  test("given an oversized matching prompt when auto workflow is enabled then injected output is bounded and does not echo the prompt", async () => {
    const prompt = `Fix this failing test ${"untrusted-content ".repeat(20_000)}`
    const result = await runSelector({ prompt }, { OMO_CODEX_AUTO_WORKFLOW: "1" })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("<lazycodex-auto-workflow>")
    expect(result.stdout).not.toContain("untrusted-content")
    expect(result.stdout.length).toBeLessThan(2_000)
  })

  test("given setup installs lfg when auto workflow is enabled then the global UserPromptSubmit hook runs the installed selector", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-workflow-selector-home-"))
    const setup = await runLfg(["--json", "setup", "--run", "--install-only"], { HOME: home })
    const pluginRoot = join(home, ".grok", "plugins", "lfg")
    const activeHooks = await readFile(join(home, ".grok", "hooks", "lfg-hooks.json"), "utf8")
    const installedSelector = join(pluginRoot, "hooks", "lfg-native-workflow-selector.mjs")
    const result = await runSelector(
      { hookEventName: "UserPromptSubmit", prompt: "Continue the approved plan" },
      { GROK_PLUGIN_ROOT: pluginRoot, OMO_CODEX_AUTO_WORKFLOW: "1" },
      installedSelector,
    )

    expect(setup.exitCode).toBe(0)
    expect(activeHooks).toContain("lfg-native-workflow-selector.mjs")
    expect((activeHooks.match(/lfg-native-workflow-selector\.mjs/g) ?? []).length).toBe(1)
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("$start-work")
  }, 20_000)
})

function runSelector(
  payload: Readonly<Record<string, string>>,
  env: Readonly<Record<string, string>> = {},
  selector = SOURCE_SELECTOR,
): Promise<HookResult> {
  return runSelectorRaw(`${JSON.stringify({ hookEventName: "UserPromptSubmit", ...payload })}\n`, env, selector)
}

function runSelectorRaw(
  stdin: string,
  env: Readonly<Record<string, string>> = {},
  selector = SOURCE_SELECTOR,
): Promise<HookResult> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [selector], {
      env: { ...process.env, ...env },
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
    child.stdin.on("error", () => undefined)
    child.stdin.end(stdin)
    child.on("close", (code) => resolve({ exitCode: code ?? 1, stdout, stderr }))
    child.on("error", () => resolve({ exitCode: 1, stdout, stderr }))
  })
}
