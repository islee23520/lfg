import { describe, expect, test } from "vitest"
import { LFG_SUBAGENT_TOGGLES, lfgOwnedSubagentModels, lfgOwnedSubagentReasoningEffort } from "./subagent-routing"

describe("subagent-routing", () => {
  test("routes slim native agents including low-token git-master", () => {
    const models = lfgOwnedSubagentModels({ fast: "fast-model", reasoning: "reasoning-model", coding: "coding-model" })
    expect(models).toEqual({
      sisyphus: "reasoning-model",
      watcher: "reasoning-model",
      explorer: "fast-model",
      "git-master": "fast-model",
    })
    expect(lfgOwnedSubagentReasoningEffort()).toEqual({
      sisyphus: "low",
      watcher: "low",
      explorer: "low",
      "git-master": "low",
    })
  })

  test("enables slim natives and disables host shadow routes", () => {
    expect(Object.fromEntries(LFG_SUBAGENT_TOGGLES)).toEqual({
      cursor: false,
      "general-purpose": false,
      explore: false,
      "browser-use": false,
      "grok-build": false,
      builder: false,
      sisyphus: true,
      watcher: true,
      lazycodex: false,
      explorer: true,
      "git-master": true,
    })
  })
})
