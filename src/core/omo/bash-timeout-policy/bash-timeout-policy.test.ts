import { describe, expect, test } from "vitest"

import {
  BASH_DEFAULT_TIMEOUT_SECONDS,
  BASH_MAX_TIMEOUT_SECONDS,
  buildBashTimeoutPrompt,
  resolveBashTimeoutDefaults,
} from "./bash-timeout-policy"

describe("bash-timeout-policy constants", () => {
  test("ships senpi-parity defaults (120s default, 600s max)", () => {
    expect(BASH_DEFAULT_TIMEOUT_SECONDS).toBe(120)
    expect(BASH_MAX_TIMEOUT_SECONDS).toBe(600)
  })
})

describe("resolveBashTimeoutDefaults", () => {
  test("uses defaults when no env overrides are present", () => {
    expect(resolveBashTimeoutDefaults({})).toEqual({
      defaultSeconds: 120,
      maxSeconds: 600,
    })
  })

  test("honours LFG_BASH_DEFAULT_TIMEOUT_SECONDS override", () => {
    expect(
      resolveBashTimeoutDefaults({ LFG_BASH_DEFAULT_TIMEOUT_SECONDS: "60" }),
    ).toEqual({ defaultSeconds: 60, maxSeconds: 600 })
  })

  test("honours LFG_BASH_MAX_TIMEOUT_SECONDS override", () => {
    expect(
      resolveBashTimeoutDefaults({ LFG_BASH_MAX_TIMEOUT_SECONDS: "900" }),
    ).toEqual({ defaultSeconds: 120, maxSeconds: 900 })
  })

  test("clamps max up to default when override would invert the pair", () => {
    const resolved = resolveBashTimeoutDefaults({
      LFG_BASH_DEFAULT_TIMEOUT_SECONDS: "300",
      LFG_BASH_MAX_TIMEOUT_SECONDS: "60",
    })
    expect(resolved.defaultSeconds).toBe(300)
    expect(resolved.maxSeconds).toBeGreaterThanOrEqual(resolved.defaultSeconds)
  })

  test("ignores non-positive / malformed env values", () => {
    expect(
      resolveBashTimeoutDefaults({
        LFG_BASH_DEFAULT_TIMEOUT_SECONDS: "not-a-number",
        LFG_BASH_MAX_TIMEOUT_SECONDS: "-5",
      }),
    ).toEqual({ defaultSeconds: 120, maxSeconds: 600 })
  })
})

describe("buildBashTimeoutPrompt", () => {
  const prompt = buildBashTimeoutPrompt({ defaultSeconds: 120, maxSeconds: 600 })

  test("announces the policy block by name", () => {
    expect(prompt).toContain("Bash Tool Timeout Policy")
  })

  test("states the default and recommended-max seconds", () => {
    expect(prompt).toContain("120")
    expect(prompt).toContain("600")
  })

  test("directs long-running commands to background via tmux or similar", () => {
    expect(prompt).toMatch(/background|tmux/i)
  })

  test("preserves an explicit agent-set timeout rather than overriding blindly", () => {
    expect(prompt).toMatch(/explicit.*timeout|timeout.*preserv/i)
  })
})
