import { describe, expect, test } from "vitest"
import { LFG_PORTED_GROK_HOOKS } from "./extension-hooks"

describe("LFG_PORTED_GROK_HOOKS catalog", () => {
  test("lists stable hook ids for parity", () => {
    const names = LFG_PORTED_GROK_HOOKS.map((h) => h.name)
    expect(names).toEqual(["lfg-visual-guidance", "lfg-agent-reminder"])
    for (const hook of LFG_PORTED_GROK_HOOKS) {
      expect(hook.description.length).toBeGreaterThan(10)
    }
  })
})