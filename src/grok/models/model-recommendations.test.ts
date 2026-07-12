import { describe, expect, test } from "vitest"
import {
  ROLE_RECOMMENDATIONS,
  PERF_SNAPSHOT,
  formatRecommendationTable,
  getAgentRecommendation,
  scoreModelForRole,
} from "./model-recommendations"

describe("model-recommendations", () => {
  test("every recommendation has a perf snapshot entry", () => {
    for (const rec of ROLE_RECOMMENDATIONS) {
      expect(PERF_SNAPSHOT[rec.recommended], `missing perf for ${rec.recommended}`).toBeDefined()
    }
  })

  test("recommended model scores 100 for its role", () => {
    for (const rec of ROLE_RECOMMENDATIONS) {
      expect(scoreModelForRole(rec.recommended, rec.role)).toBe(100)
    }
  })

  test("alternative models score as strong role fits", () => {
    for (const rec of ROLE_RECOMMENDATIONS) {
      for (const alt of rec.alternatives) {
        expect(scoreModelForRole(alt, rec.role)).toBeGreaterThanOrEqual(60)
      }
    }
  })

  test("unknown model scores below 80", () => {
    expect(scoreModelForRole("totally-fake-model", "explorer")).toBeLessThan(80)
  })

  test("formatRecommendationTable includes recommended models", () => {
    const table = formatRecommendationTable(["grok-3-mini-fast", "grok-4.3"])
    expect(table).toContain("grok-3-mini-fast")
    expect(table).toContain("grok-4.3")
    expect(table).toContain("Agent")
    expect(table).toContain("Recommended")
  })

  test("formatRecommendationTable only recommends available models", () => {
    const table = formatRecommendationTable(["grok-3-mini-fast"])
    expect(table).toContain("grok-3-mini-fast")
    expect(table).not.toContain("(not found)")
  })

  test("all core omo agents have recommendations", () => {
    const coreAgents = ["explorer", "librarian", "plan", "metis", "momus", "codex-ultrawork-reviewer", "reasoning", "coding"]
    const recommended = new Set(ROLE_RECOMMENDATIONS.map((r) => r.role))
    for (const agent of coreAgents) {
      expect(recommended.has(agent), `missing recommendation for ${agent}`).toBe(true)
    }
  })

  test("critical review recommendations prefer Grok 4.5 frontier", () => {
    const reviewer = ROLE_RECOMMENDATIONS.find((rec) => rec.role === "codex-ultrawork-reviewer")
    const momus = ROLE_RECOMMENDATIONS.find((rec) => rec.role === "momus")
    expect(reviewer?.recommended).toBe("grok-4.5")
    expect(momus?.recommended).toBe("grok-4.5")
    expect(reviewer?.alternatives).toContain("grok-4.20-0309-reasoning")
    expect(momus?.alternatives).toContain("grok-4.20-0309-reasoning")
  })

  test("role recommendations choose from available models only", () => {
    const availableModels = ["grok-3-mini-fast"]
    const table = formatRecommendationTable(availableModels)
    expect(table).toContain("grok-3-mini-fast")
    expect(table).not.toContain("gpt-5.5")
    expect(table).not.toContain("grok-4.20-0309-reasoning")
  })

  test("librarian recommendation uses composer when available", () => {
    expect(getAgentRecommendation("librarian", ["grok-composer-2.5-fast", "grok-3-mini-fast"])?.recommended).toBe("grok-composer-2.5-fast")
    expect(getAgentRecommendation("librarian", ["grok-3-mini-fast", "grok-4.20-0309-non-reasoning"])?.recommended).toBe("grok-3-mini-fast")
    expect(PERF_SNAPSHOT["grok-3-mini-fast"]).toBeDefined()
  })

  test("role recommendations are not a single global fastest ranking", () => {
    const table = formatRecommendationTable(Object.keys(PERF_SNAPSHOT))
    expect(table).toContain("explorer                    grok-composer-2.5-fast")
    expect(table).toContain("plan                        grok-4.5")
    expect(table).toContain("momus                       grok-4.5")
    expect(table).toContain("coding                      grok-composer-2.5-fast")
  })

  test("reasoning and plan prefer grok-4.5 when present", () => {
    expect(getAgentRecommendation("reasoning", Object.keys(PERF_SNAPSHOT))?.recommended).toBe("grok-4.5")
    expect(getAgentRecommendation("plan", Object.keys(PERF_SNAPSHOT))?.recommended).toBe("grok-4.5")
  })

  test("override-backed agent recommendations expose fallback chain for non-role agents", () => {
    const overrides = {
      sisyphus: {
        model: "gpt-5.5",
        model_reasoning_effort: "medium",
        model_fallback: "glm-5.2",
        role_rationale: "OMO Sisyphus orchestrator",
      },
      atlas: {
        model: "claude-sonnet-4-6",
        model_reasoning_effort: "high",
        model_fallback: "gpt-5.5",
        role_rationale: "OMO Atlas todo-list orchestrator",
      },
      oracle: {
        model: "gpt-5.5",
        model_reasoning_effort: "high",
        model_fallback: "gemini-3-pro-high",
        role_rationale: "OMO Oracle reasoning consultant",
      },
    }

    expect(getAgentRecommendation("sisyphus", ["glm-5.2"], overrides)).toMatchObject({
      recommended: "glm-5.2",
      variant: "medium",
      alternatives: [],
      fullChain: ["gpt-5.5", "glm-5.2"],
    })

    const table = formatRecommendationTable(["gpt-5.5", "gemini-3-pro-high"], overrides)
    expect(table).toContain("sisyphus")
    expect(table).toContain("atlas")
    expect(table).toContain("oracle")
  })

  test("bundled overrides take precedence over role profiles and never recommend unavailable models", () => {
    const overrides = {
      explorer: {
        model: "gpt-5.4-mini-fast",
        model_reasoning_effort: "low",
        model_fallback: "grok-3-mini-fast",
        role_rationale: "OMO explore agent",
      },
    }

    expect(getAgentRecommendation("explorer", ["grok-3-mini-fast"], overrides)).toMatchObject({
      recommended: "grok-3-mini-fast",
      variant: "low",
      alternatives: [],
      fullChain: ["gpt-5.4-mini-fast", "grok-3-mini-fast"],
    })

    const table = formatRecommendationTable(["grok-3-mini-fast"], overrides)
    expect(table).toContain("explorer                    grok-3-mini-fast")
    expect(table).not.toContain("explorer                    gpt-5.4-mini-fast")
  })

  test("perf snapshot has non-zero latency for available models", () => {
    for (const [name, perf] of Object.entries(PERF_SNAPSHOT)) {
      if (perf.available) {
        expect(perf.latencyMs, `${name} latency`).toBeGreaterThan(0)
        expect(perf.tokensPerSec, `${name} tps`).toBeGreaterThan(0)
      }
    }
  })
})
