import { describe, expect, test } from "vitest"
import { LFG_SUBAGENT_TOGGLES, lfgOwnedSubagentModels, lfgOwnedSubagentReasoningEffort } from "./subagent-routing"

describe("subagent-routing", () => {
  test("keeps only sisyphus in the retired routing helpers", () => {
    const models = lfgOwnedSubagentModels({ fast: "fast-model", reasoning: "reasoning-model", coding: "coding-model" })
    expect(models).toEqual({
      sisyphus: "reasoning-model",
    })
    expect(lfgOwnedSubagentReasoningEffort()).toEqual({
      sisyphus: "low",
    })
  })

  test("contains only the sisyphus compatibility toggle", () => {
    expect(Object.fromEntries(LFG_SUBAGENT_TOGGLES)).toEqual({ sisyphus: true })
  })
})
