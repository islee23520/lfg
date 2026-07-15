import { spawn } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

import { addNativeAccountRotateHooks, NATIVE_ACCOUNT_ROTATE_FILE } from "./native-account-rotate-hook-registration"

const hookPath = join(dirname(fileURLToPath(import.meta.url)), "..", "assets", "hooks", NATIVE_ACCOUNT_ROTATE_FILE)

describe("native account rotate hook", () => {
  test.each(["UserPromptSubmit", "SessionStart"] as const)("registers %s once", (eventName) => {
    // Given / When
    const twice = addNativeAccountRotateHooks(addNativeAccountRotateHooks({}))

    // Then
    expect(JSON.stringify(twice[eventName]).match(new RegExp(NATIVE_ACCOUNT_ROTATE_FILE, "g"))).toHaveLength(1)
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
