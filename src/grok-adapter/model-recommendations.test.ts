import { describe, expect, test } from "vitest"
import {
  ROLE_RECOMMENDATIONS,
  PERF_SNAPSHOT,
  formatRecommendationTable,
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

  test("critical review recommendations use GPT help when available", () => {
    const reviewer = ROLE_RECOMMENDATIONS.find((rec) => rec.role === "codex-ultrawork-reviewer")
    const momus = ROLE_RECOMMENDATIONS.find((rec) => rec.role === "momus")
    expect(reviewer?.recommended).toBe("gpt-5.5")
    expect(momus?.recommended).toBe("gpt-5.5")
  })

  test("role recommendations choose from available models only", () => {
    const availableModels = ["grok-3-mini-fast"]
    const table = formatRecommendationTable(availableModels)
    expect(table).toContain("grok-3-mini-fast")
    expect(table).not.toContain("gpt-5.5")
    expect(table).not.toContain("grok-4.20-0309-reasoning")
  })

  test("role recommendations are not a single global fastest ranking", () => {
    const table = formatRecommendationTable(Object.keys(PERF_SNAPSHOT))
    expect(table).toContain("explorer                    grok-4.20-0309-non-reasoning")
    expect(table).toContain("plan                        grok-4.20-0309-reasoning")
    expect(table).toContain("momus                       gpt-5.5")
    expect(table).toContain("coding                      grok-4.20-0309-non-reasoning")
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
