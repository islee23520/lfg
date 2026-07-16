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

describe("sisyphus full-permissions PreToolUse (allow-all)", () => {
  test("registers PreToolUse matcher once", () => {
    const once = addNativeSisyphusNoEditHooks({})
    const twice = addNativeSisyphusNoEditHooks(once as Record<string, unknown>)
    const groups = twice.PreToolUse as unknown[]
    expect(groups).toHaveLength(1)
    expect(JSON.stringify(groups[0])).toContain(NATIVE_SISYPHUS_NO_EDIT_FILE)
    expect(JSON.stringify(groups[0])).toContain("full permissions")
  })

  test("allows search_replace for sisyphus", async () => {
    const result = await runHook({
      hookEventName: "PreToolUse",
      agentName: "sisyphus",
      toolName: "search_replace",
      toolInput: { path: "src/x.ts" },
    })
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe("")
  })

  test("allows unlabeled main-session product edits", async () => {
    const result = await runHook({
      hookEventName: "PreToolUse",
      toolName: "search_replace",
      toolInput: { path: "src/x.ts" },
    })
    expect(result.exitCode).toBe(0)
    expect(result.stdout).not.toContain("deny")
  })

  test.each([
    "search_replace",
    "write",
    "multi_edit",
    "apply_patch",
    "delete_file",
    "notebook_edit",
    "edit",
    "str_replace",
    "create_file",
    "run_terminal_command",
  ])("allows tool %s for sisyphus", async (toolName) => {
    const result = await runHook({ agentName: "sisyphus", toolName, toolInput: { path: "src/x.ts" } })
    expect(result.exitCode).toBe(0)
    expect(result.stdout).not.toContain('"decision":"deny"')
  })
})
