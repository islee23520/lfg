import { spawn } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"
import {
  addNativeSisyphusNoEditHooks,
  NATIVE_SISYPHUS_NO_EDIT_FILE,
} from "./native-sisyphus-no-edit-hook-registration"

const hookPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "assets",
  "hooks",
  NATIVE_SISYPHUS_NO_EDIT_FILE,
)

async function runHook(payload: Record<string, unknown>): Promise<{ exitCode: number; stdout: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [hookPath], { stdio: ["pipe", "pipe", "pipe"] })
    let stdout = ""
    child.stdout.on("data", (c) => {
      stdout += String(c)
    })
    child.on("error", reject)
    child.on("close", (code) => resolve({ exitCode: code ?? 1, stdout }))
    child.stdin.end(JSON.stringify(payload))
  })
}

describe("sisyphus no-edit PreToolUse", () => {
  test("registers PreToolUse matcher once", () => {
    const once = addNativeSisyphusNoEditHooks({})
    const twice = addNativeSisyphusNoEditHooks(once as Record<string, unknown>)
    const groups = twice.PreToolUse as unknown[]
    expect(groups).toHaveLength(1)
    expect(JSON.stringify(groups[0])).toContain(NATIVE_SISYPHUS_NO_EDIT_FILE)
    expect(JSON.stringify(groups[0])).toContain("search_replace")
  })

  test("denies search_replace for sisyphus", async () => {
    const result = await runHook({
      hookEventName: "PreToolUse",
      agentName: "sisyphus",
      toolName: "search_replace",
      toolInput: { path: "src/x.ts" },
    })
    expect(result.exitCode).toBe(2)
    expect(result.stdout).toContain('"decision":"deny"')
    expect(result.stdout).toContain("handoff plan")
  })

  test("allows product edits for a non-native lazycodex label", async () => {
    const result = await runHook({
      hookEventName: "PreToolUse",
      agentName: "lazycodex",
      toolName: "search_replace",
      toolInput: { path: "src/x.ts" },
    })
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe("")
  })

  test("denies unlabeled main-session product edits (sticky sisyphus)", async () => {
    const result = await runHook({
      hookEventName: "PreToolUse",
      toolName: "search_replace",
      toolInput: { path: "src/x.ts" },
    })
    expect(result.exitCode).toBe(2)
    expect(result.stdout).toContain("deny")
    expect(result.stdout).toContain("handoff plan")
  })

  test("denies mutating shell for watcher", async () => {
    const result = await runHook({
      hookEventName: "PreToolUse",
      agentName: "watcher",
      toolName: "run_terminal_command",
      toolInput: { command: "sed -i 's/a/b/' src/foo.ts" },
    })
    expect(result.exitCode).toBe(2)
    expect(result.stdout).toContain("deny")
  })

  test("allows lfg orchestrator shell for sisyphus", async () => {
    const result = await runHook({
      hookEventName: "PreToolUse",
      agentName: "sisyphus",
      toolName: "run_terminal_command",
      toolInput: { command: "lfg --json orchestrator status" },
    })
    expect(result.exitCode).toBe(0)
  })

  test.each([
    "lfg --json handoff plan --role coding --engine gpt --focus x",
    "npx @islee23520/lfg --json orchestrator status",
    "codex exec --help",
    "ls src/grok",
    "pwd",
    "cat package.json",
    "head -n 2 package.json",
    "tail -n 2 package.json",
    "rg sisyphus src/grok",
    "grep sisyphus AGENTS.md",
    "git status --short",
    "git log -1",
    "git diff --stat",
    "git show HEAD",
    "which lfg",
  ])("allows CEO shell allowlist command: %s", async (command) => {
    const result = await runHook({ agentName: "sisyphus", toolName: "run_terminal_command", toolInput: { command } })
    expect(result.exitCode).toBe(0)
  })

  test.each([
    "npm test",
    "npm run build",
    "node scripts/build.mjs",
    "npx vitest run src/grok",
    "git add src/grok",
    "git commit -m nope",
    "echo changed > product.txt",
    "cat package.json | tee copy.json",
    "sed -i 's/a/b/' src/foo.ts",
    "find src -type f",
    "rm -f product.txt",
    "ls $(rm -rf /tmp/lfg-ceo-hook-repro)",
    "cat $(evil)",
    "cat ${EVIL}",
    "cat $EVIL",
  ])("denies CEO shell outside allowlist: %s", async (command) => {
    const result = await runHook({ agentName: "sisyphus", toolName: "run_terminal_command", toolInput: { command } })
    expect(result.exitCode).toBe(2)
    expect(result.stdout).toContain('"decision":"deny"')
  })
})
