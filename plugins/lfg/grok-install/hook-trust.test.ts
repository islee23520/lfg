import { describe, expect, test } from "vitest"
import { validateGrokHooksJson } from "./hook-trust"

describe("hook-trust", () => {
  test("accepts fixture hook list", () => {
    const result = validateGrokHooksJson({
      hooks: [{ name: "lfg-visual-guidance", description: "fixture" }],
    })
    expect(result).toEqual({ ok: true, hookNames: ["lfg-visual-guidance"], error: null })
  })

  test("rejects missing hooks array", () => {
    expect(validateGrokHooksJson({}).ok).toBe(false)
  })

  test("rejects empty hook name (#28)", () => {
    const result = validateGrokHooksJson({ hooks: [{ name: "" }] })
    expect(result.ok).toBe(false)
    expect(result.error).toContain("name")
  })
})