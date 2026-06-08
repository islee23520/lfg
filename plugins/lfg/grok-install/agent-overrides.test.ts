import { describe, expect, test } from "vitest"
import { mergeAgentTomlOverrides } from "./agent-overrides"

describe("agent-overrides (#26 extension port)", () => {
  test("preserves comments and custom keys", () => {
    const input = '# note\nmodel = "old"\ncustom = true\n'
    const out = mergeAgentTomlOverrides(input, { model: "new" })
    expect(out).toContain("# note")
    expect(out).toContain("custom = true")
    expect(out).toContain('model = "new"')
    expect(out.match(/^model =/gm)?.length).toBe(1)
  })

  test("updates reasoning effort without duplicate keys", () => {
    const out = mergeAgentTomlOverrides('model_reasoning_effort = "low"\n', { reasoningLevel: "high" })
    expect(out).toContain('model_reasoning_effort = "high"')
    expect(out.match(/model_reasoning_effort/g)?.length).toBe(1)
  })
})