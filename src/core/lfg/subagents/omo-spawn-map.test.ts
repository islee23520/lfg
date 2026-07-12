import { describe, expect, test } from "vitest"
import { lfgSubagentForOmoSpawnType } from "./omo-spawn-map"

describe("omo-spawn-map", () => {
  test("prefers host built-ins for generic explore and general-purpose", () => {
    // Given: OMO labels that match Grok host built-ins.
    const spawnTypes = ["explore", "general-purpose", "grok-build", "builder"] as const

    // When: the host-neutral lfg spawn map is applied.
    const mapped = spawnTypes.map((spawnType) => lfgSubagentForOmoSpawnType(spawnType))

    // Then: host explore/general-purpose stay identity; only shadow aliases remap.
    expect(mapped).toEqual(["explore", "general-purpose", "coding", "reviewer"])
  })

  test("keeps lfg explorer as an explicit OMO persona id", () => {
    expect(lfgSubagentForOmoSpawnType("explorer")).toBe("explorer")
  })

  test("preserves OMO persona names and unknown extension names", () => {
    // Given: spawn names that already belong to OMO/lfg or an extension.
    const spawnTypes = ["plan", "librarian", "sisyphus-junior", "custom-worker"] as const

    // When: the host-neutral lfg spawn map is applied.
    const mapped = spawnTypes.map((spawnType) => lfgSubagentForOmoSpawnType(spawnType))

    // Then: names without a replacement keep their original value.
    expect(mapped).toEqual(["plan", "librarian", "sisyphus-junior", "custom-worker"])
  })
})
