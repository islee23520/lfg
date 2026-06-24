import { userInfo } from "node:os"
import { describe, expect, test } from "vitest"
import { resolveGrokSetupHome } from "./grok-home"

describe("resolveGrokSetupHome", () => {
  test("uses the OS home even when HOME points somewhere else", () => {
    const result = resolveGrokSetupHome({
      HOME: "/tmp/lfg-not-real-home",
      LFG_ALLOW_TEST_GROK_HOME: "0",
    })

    expect(result).toBe(userInfo().homedir)
  })

  test("allows isolated test homes only behind the explicit test gate", () => {
    const result = resolveGrokSetupHome({
      HOME: "/tmp/lfg-isolated-home",
      LFG_ALLOW_TEST_GROK_HOME: "1",
    })

    expect(result).toBe("/tmp/lfg-isolated-home")
  })
})
