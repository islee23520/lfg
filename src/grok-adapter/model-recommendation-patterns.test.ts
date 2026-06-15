import { describe, expect, test } from "vitest"
import { applyRecommendationsToOverrideMap } from "./model-recommendation-patterns"
import type { LazycodexAgentOverrideMap } from "./lazycodex-agent-overrides"

/** Model IDs from C001 CLI QA (local proxy discovery). */
const C001_MODEL_IDS = [
  "grok-4.20-0309-reasoning",
  "grok-4.3",
  "grok-4.20-0309-non-reasoning",
  "grok-3-mini-fast",
  "gpt-5.5",
] as const

describe("applyRecommendationsToOverrideMap", () => {
  test("preserves bundled default and ulw while recommending other agents", () => {
    const bundled: LazycodexAgentOverrideMap = {
      default: {
        model: "grok-4.20-0309-reasoning",
        reasoningLevel: "high",
        serviceTier: "default",
        modelFallback: "gpt-5.5",
        modelFallbackReasoningLevel: "high",
        modelFallbackServiceTier: "default",
      },
      ulw: {
        model: "grok-4.3",
        reasoningLevel: "xhigh",
        serviceTier: "default",
        modelFallback: "gpt-5.5",
        modelFallbackReasoningLevel: "xhigh",
        modelFallbackServiceTier: "default",
      },
      plan: {
        model: "grok-4.3",
        reasoningLevel: "xhigh",
        serviceTier: "default",
      },
      librarian: {
        model: "grok-3-mini-fast",
        reasoningLevel: "low",
        serviceTier: "fast",
      },
    }

    const out = applyRecommendationsToOverrideMap(bundled, [...C001_MODEL_IDS], "grok")

    expect(out.default).toEqual(bundled.default)
    expect(out.ulw).toEqual(bundled.ulw)
    expect(out.plan?.model).toBe("grok-4.20-0309-reasoning")
    expect(out.librarian?.model).toBe("grok-4.20-0309-non-reasoning")
  })
})