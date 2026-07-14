import { describe, expect, test } from "vitest"
import { lfgSubagentForOmoSpawnType, OMO_SPAWN_TYPE_TO_LFG_SUBAGENT } from "./omo-spawn-map"

describe("omo-spawn-map", () => {
  test("redirects builtin labels to OMO personas (Option 2C)", () => {
    // Given: builtin labels that should carry OMO behavior patterns.
    const spawnTypes = ["explore", "general-purpose", "plan"] as const

    // When: the spawn map redirects builtins to OMO personas.
    const mapped = spawnTypes.map((spawnType) => lfgSubagentForOmoSpawnType(spawnType))

    // Then: builtins redirect to OMO personas with installed prompts/models.
    expect(mapped).toEqual(["explorer", "sisyphus", "prometheus"])
  })

  test("redirects shadow aliases to specialist personas", () => {
    expect(lfgSubagentForOmoSpawnType("grok-build")).toBe("coding")
    expect(lfgSubagentForOmoSpawnType("builder")).toBe("reviewer")
  })

  test("keeps OMO persona names identity-mapped", () => {
    expect(lfgSubagentForOmoSpawnType("explorer")).toBe("explorer")
    expect(lfgSubagentForOmoSpawnType("sisyphus")).toBe("sisyphus")
    expect(lfgSubagentForOmoSpawnType("librarian")).toBe("librarian")
    expect(lfgSubagentForOmoSpawnType("oracle")).toBe("oracle")
    expect(lfgSubagentForOmoSpawnType("prometheus")).toBe("prometheus")
  })

  test("passes through unknown extension names", () => {
    expect(lfgSubagentForOmoSpawnType("custom-worker")).toBe("custom-worker")
    expect(lfgSubagentForOmoSpawnType("sisyphus-junior")).toBe("sisyphus-junior")
  })

  test("resolves upstream difficulty-tier workers to Grok worker subagent names", () => {
    // Given: upstream OMO/lazycodex difficulty-tier spawn labels that must be first-class map keys.
    const upstreamWorkers = [
      "lazycodex-worker-low",
      "lazycodex-worker-medium",
      "lazycodex-worker-high",
    ] as const

    // When: the spawn map table and resolver are consulted for each worker label.
    // Then: workers are explicit map entries (not unknown pass-through) and identity-map to Grok names.
    for (const spawnType of upstreamWorkers) {
      expect(Object.hasOwn(OMO_SPAWN_TYPE_TO_LFG_SUBAGENT, spawnType), spawnType).toBe(true)
      expect(OMO_SPAWN_TYPE_TO_LFG_SUBAGENT[spawnType]).toBe(spawnType)
      expect(lfgSubagentForOmoSpawnType(spawnType)).toBe(spawnType)
    }
  })
})
