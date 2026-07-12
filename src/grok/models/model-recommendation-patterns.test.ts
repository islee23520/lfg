import { describe, expect, test } from "vitest"
import { applyRecommendationsToOverrideMap } from "./model-recommendation-availability"
import type { LazycodexAgentOverrideMap } from "../agents/lazycodex-agent-overrides"

/** Model IDs from C001 CLI QA (local proxy discovery). */
const C001_MODEL_IDS = [
  "grok-4.5",
  "grok-4.20-0309-reasoning",
  "grok-4.3",
  "grok-4.20-0309-non-reasoning",
  "grok-3-mini-fast",
  "gpt-5.5",
  "glm-5.2",
  "glm-5-turbo",
  "grok-composer-2.5-fast",
  "gemini-3-pro-high",
] as const

describe("applyRecommendationsToOverrideMap", () => {
  test("preserves available curated routes while recommending other agents", () => {
    const bundled: LazycodexAgentOverrideMap = {
      default: {
        model: "grok-4.5",
        reasoningLevel: "high",
        serviceTier: "default",
        modelFallback: "gpt-5.5",
        modelFallbackReasoningLevel: "high",
        modelFallbackServiceTier: "default",
      },
      prometheus: {
        model: "grok-4.5",
        reasoningLevel: "xhigh",
        serviceTier: "default",
        modelFallback: "gpt-5.5",
        modelFallbackReasoningLevel: "high",
        modelFallbackServiceTier: "default",
      },
      sisyphus: {
        model: "grok-4.5",
        reasoningLevel: "medium",
        serviceTier: "default",
      },
      atlas: {
        model: "gpt-5.5",
        reasoningLevel: "high",
        serviceTier: "default",
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

    const out = applyRecommendationsToOverrideMap(bundled, [...C001_MODEL_IDS])

    expect(out.default).toEqual(bundled.default)
    expect(out.prometheus).toMatchObject({ model: "grok-4.5", reasoningLevel: "xhigh" })
    expect(out.prometheus?.modelFallback).toBe("gpt-5.5")
    expect(out.sisyphus).toEqual(bundled.sisyphus)
    expect(out.atlas).toEqual(bundled.atlas)
    // plan is not curated: pattern recommendation picks grok-4.5
    expect(out.plan?.model).toBe("grok-4.5")
    // librarian is not curated: utility pattern prefers composer over mini
    expect(out.librarian?.model).toBe("grok-composer-2.5-fast")
  })

  test("auto recommends Composer for coding and Grok for visual agents", () => {
    const bundled: LazycodexAgentOverrideMap = {
      coding: { model: "old-coding", reasoningLevel: "medium", serviceTier: "default" },
      "visual-engineering": { model: "old-visual", reasoningLevel: "high", serviceTier: "default" },
    }

    const out = applyRecommendationsToOverrideMap(bundled, [...C001_MODEL_IDS])

    expect(out.coding?.model).toBe("grok-composer-2.5-fast")
    expect(out["visual-engineering"]?.model).toBe("grok-4.5")
  })

  test("replaces unavailable curated routes with available fallback models", () => {
    const bundled: LazycodexAgentOverrideMap = {
      atlas: {
        model: "claude-sonnet-4-6",
        reasoningLevel: "high",
        serviceTier: "default",
        modelFallback: "gpt-5.5",
        modelFallbackReasoningLevel: "high",
        modelFallbackServiceTier: "default",
      },
      prometheus: {
        model: "gpt-5.5",
        reasoningLevel: "xhigh",
        serviceTier: "default",
        modelFallback: "missing-model",
        modelFallbackReasoningLevel: "high",
        modelFallbackServiceTier: "default",
      },
    }

    const out = applyRecommendationsToOverrideMap(bundled, [...C001_MODEL_IDS])

    expect(out.atlas).toMatchObject({ model: "gpt-5.5", reasoningLevel: "high" })
    expect(out.atlas?.modelFallback).toBeUndefined()
    expect(out.prometheus).toMatchObject({ model: "gpt-5.5", reasoningLevel: "xhigh" })
    expect(out.prometheus?.modelFallback).toBeUndefined()
  })
})
