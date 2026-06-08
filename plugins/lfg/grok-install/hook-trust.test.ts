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
})