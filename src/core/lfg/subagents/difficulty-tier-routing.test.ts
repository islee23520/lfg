import { describe, expect, test } from "vitest"
import { resolveDifficultyTierRoute } from "./difficulty-tier-routing"

/**
 * Host-neutral difficulty-tier routing (upstream lazycodex-worker-low|medium|high).
 * Tests intentionally target the shipped seam before production implementation.
 */
describe("resolveDifficultyTierRoute", () => {
  test("defaults each explicit tier to the matching upstream lazycodex-worker agent", () => {
    // Given: well-formed difficulty metadata for each tier and no availability filter.
    const cases = [
      { difficulty: "low", agent: "lazycodex-worker-low" },
      { difficulty: "medium", agent: "lazycodex-worker-medium" },
      { difficulty: "high", agent: "lazycodex-worker-high" },
    ] as const

    for (const { difficulty, agent } of cases) {
      // When: the host-neutral router resolves the tier with defaults available.
      const route = resolveDifficultyTierRoute(
        { difficulty },
        {
          availableSubagentTypes: [
            "lazycodex-worker-low",
            "lazycodex-worker-medium",
            "lazycodex-worker-high",
            "quick",
            "coding",
            "unspecified-high",
          ],
        },
      )

      // Then: tier, upstream agent, and subagent_type stay on the matching worker.
      expect(route.tier).toBe(difficulty)
      expect(route.upstreamAgentType).toBe(agent)
      expect(route.subagentType).toBe(agent)
      expect(typeof route.guidance).toBe("string")
      expect(route.guidance.length).toBeGreaterThan(0)
    }
  })

  test("absent or malformed metadata falls back to medium tier", () => {
    // Given: metadata that is missing, not an object, or has an invalid difficulty.
    const malformed: readonly unknown[] = [
      undefined,
      null,
      "high",
      42,
      [],
      {},
      { difficulty: "extreme" },
      { difficulty: "" },
      { difficulty: 1 },
      { tier: "high" },
    ]

    for (const metadata of malformed) {
      // When: the router resolves without an available-types filter (defaults present).
      const route = resolveDifficultyTierRoute(metadata, {
        availableSubagentTypes: [
          "lazycodex-worker-low",
          "lazycodex-worker-medium",
          "lazycodex-worker-high",
        ],
      })

      // Then: medium is the safe default tier and worker.
      expect(route.tier).toBe("medium")
      expect(route.upstreamAgentType).toBe("lazycodex-worker-medium")
      expect(route.subagentType).toBe("lazycodex-worker-medium")
      expect(route.guidance.length).toBeGreaterThan(0)
    }
  })

  test("configured override wins only when that subagent type is available", () => {
    // Given: medium metadata, a custom override for medium, and that override available.
    const available = [
      "custom-medium-worker",
      "lazycodex-worker-medium",
      "coding",
    ] as const

    // When: the override target is in availableSubagentTypes.
    const hit = resolveDifficultyTierRoute(
      { difficulty: "medium" },
      {
        overrides: { medium: "custom-medium-worker" },
        availableSubagentTypes: available,
      },
    )

    // Then: subagentType uses the override; upstream keeps the default worker name.
    expect(hit.tier).toBe("medium")
    expect(hit.upstreamAgentType).toBe("lazycodex-worker-medium")
    expect(hit.subagentType).toBe("custom-medium-worker")

    // When: the same override is configured but not available.
    const miss = resolveDifficultyTierRoute(
      { difficulty: "medium" },
      {
        overrides: { medium: "custom-medium-worker" },
        availableSubagentTypes: ["lazycodex-worker-medium", "coding"],
      },
    )

    // Then: override is ignored and the default worker is selected.
    expect(miss.tier).toBe("medium")
    expect(miss.upstreamAgentType).toBe("lazycodex-worker-medium")
    expect(miss.subagentType).toBe("lazycodex-worker-medium")
  })

  test("unavailable default workers fall back low→quick, medium→coding, high→unspecified-high", () => {
    // Given: only Grok category fallback personas are available (no tier workers).
    const available = ["quick", "coding", "unspecified-high", "explorer"] as const
    const cases = [
      { difficulty: "low", fallback: "quick", upstream: "lazycodex-worker-low" },
      { difficulty: "medium", fallback: "coding", upstream: "lazycodex-worker-medium" },
      { difficulty: "high", fallback: "unspecified-high", upstream: "lazycodex-worker-high" },
    ] as const

    for (const { difficulty, fallback, upstream } of cases) {
      // When: the router resolves a tier whose default worker is not installed.
      const route = resolveDifficultyTierRoute(
        { difficulty },
        { availableSubagentTypes: available },
      )

      // Then: upstream still names the intended worker; subagentType uses the tier fallback.
      expect(route.tier).toBe(difficulty)
      expect(route.upstreamAgentType).toBe(upstream)
      expect(route.subagentType).toBe(fallback)
      expect(route.guidance).toMatch(/fallback|unavailable|quick|coding|unspecified-high|worker/i)
    }
  })

  test("unavailable override falls through to default worker, then to tier fallback", () => {
    // Given: a medium override that is not available, and the default worker also missing.
    // When: only the medium tier fallback persona is available.
    const route = resolveDifficultyTierRoute(
      { difficulty: "medium" },
      {
        overrides: { medium: "missing-override" },
        availableSubagentTypes: ["coding", "quick"],
      },
    )

    // Then: override and default worker are skipped; coding is the medium fallback.
    expect(route.tier).toBe("medium")
    expect(route.upstreamAgentType).toBe("lazycodex-worker-medium")
    expect(route.subagentType).toBe("coding")
  })

  test("without availableSubagentTypes, defaults are assumed available", () => {
    // Given: explicit high difficulty and no availability list.
    // When: the router runs with only optional overrides omitted.
    const route = resolveDifficultyTierRoute({ difficulty: "high" })

    // Then: the high worker is selected without requiring an availability filter.
    expect(route.tier).toBe("high")
    expect(route.upstreamAgentType).toBe("lazycodex-worker-high")
    expect(route.subagentType).toBe("lazycodex-worker-high")
    expect(typeof route.guidance).toBe("string")
  })

  test("accepts difficulty from nested metadata bags used by spawn payloads", () => {
    // Given: difficulty nested under common spawn/task metadata shapes.
    const nested = [
      { task: { difficulty: "low" } },
      { metadata: { difficulty: "high" } },
      { agent_type: "lazycodex-worker-low" },
      { agentType: "lazycodex-worker-high" },
    ] as const

    // When / Then: each shape resolves to the matching tier.
    expect(resolveDifficultyTierRoute(nested[0]).tier).toBe("low")
    expect(resolveDifficultyTierRoute(nested[1]).tier).toBe("high")
    expect(resolveDifficultyTierRoute(nested[2]).tier).toBe("low")
    expect(resolveDifficultyTierRoute(nested[2]).subagentType).toBe("lazycodex-worker-low")
    expect(resolveDifficultyTierRoute(nested[3]).tier).toBe("high")
    expect(resolveDifficultyTierRoute(nested[3]).subagentType).toBe("lazycodex-worker-high")
  })
})
