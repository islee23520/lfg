import { spawn } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

import { addNativeAccountRotateHooks, NATIVE_ACCOUNT_ROTATE_FILE } from "./native-account-rotate-hook-registration"

const hookPath = join(dirname(fileURLToPath(import.meta.url)), "..", "assets", "hooks", NATIVE_ACCOUNT_ROTATE_FILE)

describe("native account rotate hook", () => {
  test("registers only UserPromptSubmit once so SessionStart cannot clobber freshly refreshed host auth", () => {
    // Given / When
    const legacy = {
      SessionStart: [{ hooks: [{ command: `node "\${GROK_PLUGIN_ROOT}/hooks/${NATIVE_ACCOUNT_ROTATE_FILE}"` }] }],
    }
    const twice = addNativeAccountRotateHooks(addNativeAccountRotateHooks(legacy))

    // Then
    expect(JSON.stringify(twice.UserPromptSubmit).match(new RegExp(NATIVE_ACCOUNT_ROTATE_FILE, "g"))).toHaveLength(1)
    expect(JSON.stringify(twice.SessionStart ?? [])).not.toContain(NATIVE_ACCOUNT_ROTATE_FILE)
  })

  test("surfaces auth_expired_login_required as hook guidance", async () => {
    const output = await new Promise<string>((resolve, reject) => {
      const child = spawn(process.execPath, [hookPath], {
        env: {
          ...process.env,
          LFG_ACCOUNT_ROTATE_COMMAND: process.execPath,
          LFG_ACCOUNT_ROTATE_ARGS: JSON.stringify(["-e", "process.stdout.write(JSON.stringify({status:'auth_expired_login_required'}))"]),
        },
        stdio: ["pipe", "pipe", "pipe"],
      })
      let stdout = ""
      child.stdout.on("data", (chunk) => { stdout += String(chunk) })
      child.on("error", reject)
      child.on("close", () => resolve(stdout))
      child.stdin.end(JSON.stringify({ hookEventName: "UserPromptSubmit" }))
    })

    expect(JSON.parse(output)).toMatchObject({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: expect.stringContaining("auth_expired_login_required"),
      },
    })
  })

  test("invokes the account rotation command without exposing command output", async () => {
    // Given / When
    const output = await new Promise<string>((resolve, reject) => {
      const child = spawn(process.execPath, [hookPath], {
        env: { ...process.env, LFG_ACCOUNT_ROTATE_COMMAND: process.execPath, LFG_ACCOUNT_ROTATE_ARGS: JSON.stringify(["-e", "process.stdout.write('secret-token')"]) },
        stdio: ["pipe", "pipe", "pipe"],
      })
      let stdout = ""
      child.stdout.on("data", (chunk) => { stdout += String(chunk) })
      child.on("error", reject)
      child.on("close", () => resolve(stdout))
      child.stdin.end(JSON.stringify({ hookEventName: "SessionStart" }))
    })

    // Then
    expect(output).toBe("")
  })
})
