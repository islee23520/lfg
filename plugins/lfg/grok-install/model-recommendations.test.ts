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

  test("alternative model scores 80 for its role", () => {
    for (const rec of ROLE_RECOMMENDATIONS) {
      for (const alt of rec.alternatives) {
        expect(scoreModelForRole(alt, rec.role)).toBe(80)
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

  test("formatRecommendationTable marks missing models", () => {
    const table = formatRecommendationTable(["grok-3-mini-fast"])
    // grok-4.3 is recommended for codex-ultrawork-reviewer but not in available list
    expect(table).toContain("(not found)")
  })

  test("all core omo agents have recommendations", () => {
    const coreAgents = ["explorer", "librarian", "plan", "metis", "momus", "codex-ultrawork-reviewer", "reasoning", "coding"]
    const recommended = new Set(ROLE_RECOMMENDATIONS.map((r) => r.role))
    for (const agent of coreAgents) {
      expect(recommended.has(agent), `missing recommendation for ${agent}`).toBe(true)
    }
  })

  test("all recommendations use Grok models", () => {
    for (const rec of ROLE_RECOMMENDATIONS) {
      expect(rec.recommended).toMatch(/^grok-/)
    }
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
