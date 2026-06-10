import { describe, expect, test } from "vitest"
import { validateGrokHooksJson } from "./hook-trust"

describe("hook-trust", () => {
  test("accepts Grok event map", () => {
    const result = validateGrokHooksJson({
      hooks: {
        SessionStart: [{ hooks: [{ type: "command", command: "true" }] }],
      },
    })
    expect(result).toEqual({ ok: true, hookNames: ["SessionStart"], error: null })
  })

  test("rejects missing hooks object", () => {
    expect(validateGrokHooksJson({}).ok).toBe(false)
  })

  test("rejects legacy metadata catalog (#28)", () => {
    const result = validateGrokHooksJson({ hooks: [{ name: "lfg-visual-guidance" }] })
    expect(result.ok).toBe(false)
    expect(result.error).toContain("legacy metadata")
  })

  test("rejects empty command", () => {
    const result = validateGrokHooksJson({
      hooks: { PreToolUse: [{ hooks: [{ type: "command", command: "" }] }] },
    })
    expect(result.ok).toBe(false)
    expect(result.error).toContain("command")
  })
})