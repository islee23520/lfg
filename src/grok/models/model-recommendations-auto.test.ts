import { describe, expect, test } from "vitest"
import {
  REASONING_AGENT_NAMES,
  selectModelForPatterns,
  buildRecommendedModelOverrides,
  applyRecommendedModelOverrides,
  type RecommendedModelFields,
} from "./model-recommendation-patterns"
import type { LazycodexAgentOverrideMap } from "../agents/lazycodex-agent-overrides"

describe("pattern-based model auto-assignment", () => {
  test("REASONING_AGENT_NAMES includes lfp agents", () => {
    expect(REASONING_AGENT_NAMES.has("metis")).toBe(true)
    expect(REASONING_AGENT_NAMES.has("momus")).toBe(true)
    expect(REASONING_AGENT_NAMES.has("plan")).toBe(true)
    expect(REASONING_AGENT_NAMES.has("ulw-plan")).toBe(true)
    expect(REASONING_AGENT_NAMES.has("review-work")).toBe(true)
    expect(REASONING_AGENT_NAMES.has("codex-ultrawork-reviewer")).toBe(true)
    expect(REASONING_AGENT_NAMES.has("reasoning")).toBe(true)
    expect(REASONING_AGENT_NAMES.has("oracle")).toBe(true)
    expect(REASONING_AGENT_NAMES.has("hephaestus")).toBe(true)
    expect(REASONING_AGENT_NAMES.has("atlas")).toBe(true)
    expect(REASONING_AGENT_NAMES.has("deep")).toBe(true)
    expect(REASONING_AGENT_NAMES.has("ultrabrain")).toBe(true)
  })

  test("selectModelForPatterns picks GPT or GLM reasoning before Grok", () => {
    const models = ["gpt-5.5", "glm-5.2", "grok-4.20-0309-reasoning", "grok-3-mini-fast"]
    const selected = selectModelForPatterns(models, "reasoning")
    expect(selected).toBe("gpt-5.5")
  })

  test("selectModelForPatterns picks fast GPT/GLM utility before Grok mini", () => {
    const models = ["gpt-5.4-mini", "glm-5-turbo", "grok-3-mini-fast", "grok-4.3"]
    const selected = selectModelForPatterns(models, "utility")
    expect(selected).toBe("gpt-5.4-mini")
  })

  test("selectModelForPatterns falls back to first model when no pattern matches", () => {
    const models = ["some-random-model"]
    const selected = selectModelForPatterns(models, "reasoning")
    expect(selected).toBe("some-random-model")
  })

  test("selectModelForPatterns returns undefined for empty model list", () => {
    const selected = selectModelForPatterns([], "reasoning")
    expect(selected).toBeUndefined()
  })

  test("buildRecommendedModelOverrides assigns reasoning models to reasoning agents", () => {
    const overrides: LazycodexAgentOverrideMap = {
      explorer: { model: "grok-3-mini-fast", reasoningLevel: "low" },
      plan: { model: "grok-4.3", reasoningLevel: "high" },
      coding: { model: "grok-4.20-0309-non-reasoning", reasoningLevel: "medium" },
    }
    const models = ["grok-3-mini-fast", "grok-4.20-0309-reasoning", "grok-4.3", "gpt-5.5", "glm-5.2"]
    const recs = buildRecommendedModelOverrides(overrides, models)
    const planRec = recs.get("plan")
    expect(planRec).toBeDefined()
    expect(planRec!.model).toBe("gpt-5.5")
    expect(planRec!.reasoningLevel).toBe("xhigh")
    expect(planRec!.serviceTier).toBe("default")
  })

  test("buildRecommendedModelOverrides assigns utility models to non-reasoning agents", () => {
    const overrides: LazycodexAgentOverrideMap = {
      explorer: { model: "old-model", reasoningLevel: "low" },
    }
    const models = ["grok-3-mini-fast", "grok-4.3"]
    const recs = buildRecommendedModelOverrides(overrides, models)
    const explorerRec = recs.get("explorer")
    expect(explorerRec).toBeDefined()
    expect(explorerRec!.model).toBe("grok-3-mini-fast")
    expect(explorerRec!.reasoningLevel).toBe("low")
    expect(explorerRec!.serviceTier).toBe("fast")
  })

  test("buildRecommendedModelOverrides handles empty overrides", () => {
    const recs = buildRecommendedModelOverrides({}, ["grok-3-mini-fast"])
    expect(recs.size).toBe(0)
  })

  test("applyRecommendedModelOverrides merges recommendations into existing overrides", () => {
    const overrides: Record<string, { model: string; reasoningLevel: string; serviceTier?: string }> = {
      explorer: { model: "old-model", reasoningLevel: "low" },
    }
    const recs = new Map<string, RecommendedModelFields>([
      ["explorer", { model: "grok-3-mini-fast", reasoningLevel: "low", serviceTier: "fast" }],
    ])
    applyRecommendedModelOverrides(overrides, recs)
    expect(overrides.explorer.model).toBe("grok-3-mini-fast")
    expect(overrides.explorer.serviceTier).toBe("fast")
  })

  test("reasoning patterns prefer GPT over Grok", () => {
    const models = ["gpt-5.5", "grok-4.20-0309-reasoning"]
    const selected = selectModelForPatterns(models, "reasoning")
    expect(selected).toBe("gpt-5.5")
  })

  test("utility patterns prefer GPT mini over Grok mini", () => {
    const models = ["gpt-5.4-mini", "grok-3-mini-fast"]
    const selected = selectModelForPatterns(models, "utility")
    expect(selected).toBe("gpt-5.4-mini")
  })

  test("coding patterns prefer Composer 2.5", () => {
    const models = ["gpt-5.3-codex-spark", "grok-composer-2.5-fast", "grok-4.20-0309-non-reasoning"]
    const selected = selectModelForPatterns(models, "coding")
    expect(selected).toBe("grok-composer-2.5-fast")
  })

  test("visual patterns prefer Gemini", () => {
    const models = ["gpt-5.5", "grok-4.3", "gemini-3-pro-high"]
    const selected = selectModelForPatterns(models, "visual")
    expect(selected).toBe("gemini-3-pro-high")
  })
})
