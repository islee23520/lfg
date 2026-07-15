import { describe, expect, test } from "vitest"
import { resolveDifficultyTierRoute } from "./difficulty-tier-routing"

describe("resolveDifficultyTierRoute", () => {
  test.each([
    ["low", "lazycodex-worker-low"],
    ["medium", "lazycodex-worker-medium"],
    ["high", "lazycodex-worker-high"],
  ] as const)("sizes %s work for external Codex while retaining legacy identity", (difficulty, legacyWorker) => {
    const route = resolveDifficultyTierRoute({ difficulty })

    expect(route).toMatchObject({
      tier: difficulty,
      legacyAgentType: legacyWorker,
      implementationTransport: "external-codex-app-server",
      handoffCommand: "lfg --json handoff plan --role coding --engine gpt",
    })
    expect(route).not.toHaveProperty("subagentType")
  })

  test.each([
    undefined,
    null,
    "high",
    42,
    [],
    {},
    { difficulty: "extreme" },
    { task: { difficulty: "medium" } },
    { metadata: { difficulty: "high" } },
    { agent_type: "lazycodex-worker-low" },
  ])("parses legacy metadata without restoring an in-host implementer route: %j", (metadata) => {
    const route = resolveDifficultyTierRoute(metadata)

    expect(route.handoffCommand).toBe("lfg --json handoff plan --role coding --engine gpt")
    expect(route.implementationTransport).toBe("external-codex-app-server")
    expect(route).not.toHaveProperty("subagentType")
  })
})
