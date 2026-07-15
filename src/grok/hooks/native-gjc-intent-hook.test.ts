import { chmod, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { spawn } from "node:child_process"
import { describe, expect, test } from "vitest"
import { addNativeGjcIntentHooks, NATIVE_GJC_INTENT_FILE } from "./native-gjc-intent-hook-registration"
import { addNativeCodexAssignHooks, NATIVE_CODEX_ASSIGN_FILE } from "./native-codex-assign-hook-registration"
import {
  buildGjcIntentContext,
  parseGjcIntentOutput,
  shouldSkipGjcIntent,
} from "../assets/hooks/lfg-native-gjc-intent.mjs"

const hookPath = join(dirname(fileURLToPath(import.meta.url)), "..", "assets", "hooks", "lfg-native-gjc-intent.mjs")

describe("native gjc intent gateway", () => {
  test("registers once before codex assignment handoff", () => {
    const once = addNativeCodexAssignHooks(addNativeGjcIntentHooks({}))
    const twice = addNativeCodexAssignHooks(addNativeGjcIntentHooks(once))
    const groups = Array.isArray(twice.UserPromptSubmit) ? twice.UserPromptSubmit : []
    const commands = groups.flatMap((group) => {
      if (typeof group !== "object" || group === null) return []
      const hooks = (group as { readonly hooks?: unknown }).hooks
      if (!Array.isArray(hooks)) return []
      return hooks.flatMap((hook) => {
        if (typeof hook !== "object" || hook === null) return []
        const command = (hook as { readonly command?: unknown }).command
        return typeof command === "string" ? [command] : []
      })
    })
    expect(commands.filter((command) => command.includes(NATIVE_GJC_INTENT_FILE))).toHaveLength(1)
    expect(commands.indexOf(commands.find((command) => command.includes(NATIVE_GJC_INTENT_FILE)) ?? "")).toBeLessThan(
      commands.indexOf(commands.find((command) => command.includes(NATIVE_CODEX_ASSIGN_FILE)) ?? ""),
    )
  })

  test("parses JSON and structured-line classifications", () => {
    expect(parseGjcIntentOutput('{"intent":"change","ambiguity":"high","route":"clarify","refined_focus":"choose API"}')).toEqual({
      intent: "change",
      ambiguity: "high",
      route: "clarify",
      refinedFocus: "choose API",
    })
    expect(parseGjcIntentOutput("intent=inspect | ambiguity=low | route=explore")).toEqual({
      intent: "inspect",
      ambiguity: "low",
      route: "explore",
    })
  })

  test("skips only empty and trivial greetings", () => {
    expect(shouldSkipGjcIntent("hello")).toBe(true)
    expect(shouldSkipGjcIntent("thanks!")).toBe(true)
    expect(shouldSkipGjcIntent("please implement the hook")).toBe(false)
  })

  test("context enforces clarify-first and Codex-only implementation", () => {
    const context = buildGjcIntentContext({
      status: "classified",
      classification: { intent: "change", ambiguity: "high", route: "codex", refinedFocus: "hook wiring" },
    })
    expect(context).toContain("lfg-gjc-intent-gateway")
    expect(context).toContain("ask clarify first")
    expect(context).toContain("Codex app-server")
    expect(context.toLowerCase()).toContain("never use gjc as product implementer")
    expect(context.toLowerCase()).toContain("never spawn in-host lazycodex implementer")
  })

  test("fake gjc runner injects parsed classification", async () => {
    const bin = await mkdtemp(join(tmpdir(), "lfg-fake-gjc-"))
    const gjc = join(bin, "gjc")
    await writeFile(gjc, '#!/bin/sh\nprintf \'%s\\n\' \'{"intent":"change","ambiguity":"med","route":"codex","refined_focus":"gateway"}\'\n')
    await chmod(gjc, 0o755)

    const result = await runHook("implement the gateway", { PATH: `${bin}:${process.env.PATH ?? ""}` })
    expect(result.exitCode).toBe(0)
    const context = parseHookContext(result.stdout)
    expect(context).toContain('status="classified"')
    expect(context).toContain('route="codex"')
    expect(context).toContain("Codex app-server")
  })

  test("missing gjc fails open with status note", async () => {
    const emptyPath = await mkdtemp(join(tmpdir(), "lfg-missing-gjc-"))
    const result = await runHook("inspect this task", { PATH: emptyPath })
    expect(result.exitCode).toBe(0)
    const context = parseHookContext(result.stdout)
    expect(context).toContain('status="missing"')
    expect(context).toContain("fail-open")
  })

  test("malformed gjc output fails open", async () => {
    const bin = await mkdtemp(join(tmpdir(), "lfg-malformed-gjc-"))
    const gjc = join(bin, "gjc")
    await writeFile(gjc, "#!/bin/sh\nprintf 'not-a-classification\\n'\n")
    await chmod(gjc, 0o755)
    const result = await runHook("inspect this task", { PATH: `${bin}:${process.env.PATH ?? ""}` })
    expect(parseHookContext(result.stdout)).toContain('status="malformed"')
  })

  test("gjc timeout fails open", async () => {
    const bin = await mkdtemp(join(tmpdir(), "lfg-timeout-gjc-"))
    const gjc = join(bin, "gjc")
    await writeFile(gjc, "#!/bin/sh\nsleep 1\n")
    await chmod(gjc, 0o755)
    const result = await runHook("inspect this task", {
      PATH: `${bin}:${process.env.PATH ?? ""}`,
      LFG_GJC_INTENT_TIMEOUT_MS: "20",
    })
    expect(parseHookContext(result.stdout)).toContain('status="timeout"')
  })
})

async function runHook(prompt: string, env: Readonly<Record<string, string>>): Promise<{ readonly exitCode: number; readonly stdout: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [hookPath], {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    })
    let stdout = ""
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk)
    })
    child.on("error", reject)
    child.on("close", (code) => resolve({ exitCode: code ?? 1, stdout }))
    child.stdin.end(JSON.stringify({ hookEventName: "UserPromptSubmit", prompt }))
  })
}

function parseHookContext(stdout: string): string {
  const payload: unknown = JSON.parse(stdout)
  if (typeof payload !== "object" || payload === null) return ""
  const specific = (payload as { readonly hookSpecificOutput?: unknown }).hookSpecificOutput
  if (typeof specific !== "object" || specific === null) return ""
  const context = (specific as { readonly additionalContext?: unknown }).additionalContext
  return typeof context === "string" ? context : ""
}
