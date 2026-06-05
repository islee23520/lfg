import { describe, expect, test } from "vitest"
import { runLfg } from "./test-process"

describe("removed Grok BYOK command surface", () => {
  test("config grok-byok is not exposed from the package installer CLI", async () => {
    const result = await runLfg(["--json", "config", "grok-byok"], { LFG_GROK_API_KEY: "secret-test-key" })

    expect(result.exitCode).toBe(1)
    expect(result.json).toMatchObject({
      ok: false,
      status: "error",
      code: "unsupported_command",
      command: "config grok-byok",
      supportedCommands: ["setup", "doctor", "dry-setup"],
    })
    expect(JSON.stringify(result.json)).not.toContain("secret-test-key")
  })
})
