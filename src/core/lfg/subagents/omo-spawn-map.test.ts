import { describe, expect, test } from "vitest"
import { lfgSubagentForOmoSpawnType } from "./omo-spawn-map"

describe("omo-spawn-map", () => {
  test("maps upstream OMO built-in spawn names to lfg personas", () => {
    // Given: upstream OMO spawn names that collide with Grok built-in personas.
    const spawnTypes = ["explore", "general-purpose", "grok-build", "builder"] as const

    // When: the host-neutral lfg spawn map is applied.
    const mapped = spawnTypes.map((spawnType) => lfgSubagentForOmoSpawnType(spawnType))

    // Then: each spawn type resolves to the lfg-owned replacement persona.
    expect(mapped).toEqual(["explorer", "sisyphus", "coding", "reviewer"])
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
