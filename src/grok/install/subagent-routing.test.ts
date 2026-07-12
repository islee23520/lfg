import { describe, expect, test } from "vitest"
import { lfgSubagentForOmoSpawnType } from "../../core/lfg/subagents/omo-spawn-map"
import { LFG_SUBAGENT_TOGGLES, lfgOwnedSubagentModels, lfgOwnedSubagentReasoningEffort } from "./subagent-routing"

/** Shadow aliases only — not real host primaries we want to keep. */
const GROK_SHADOW_ALIASES_DISABLED = ["grok-build", "builder"] as const
const GROK_HOST_BUILTINS_ENABLED = ["general-purpose", "explore"] as const

describe("subagent-routing", () => {
  test("covers OMO native, OMO category, and Grok visual/artistry surfaces", () => {
    const models = lfgOwnedSubagentModels({
      fast: "fast-model",
      reasoning: "reasoning-model",
      coding: "coding-model",
    })

    expect(models.default).toBe("reasoning-model")
    expect(models.sisyphus).toBe("reasoning-model")
    expect(models.hephaestus).toBe("reasoning-model")
    expect(models.oracle).toBe("reasoning-model")
    expect(models.ultrabrain).toBe("reasoning-model")
    expect(models.deep).toBe("reasoning-model")
    expect(models["unspecified-high"]).toBe("reasoning-model")
    expect(models.artistry).toBe("reasoning-model")
    expect(models["artistry-gen"]).toBe("reasoning-model")
    expect(models["artistry-qa"]).toBe("reasoning-model")
    expect(models.ulw).toBe("reasoning-model")
    expect(models["multimodal-looker"]).toBe("fast-model")
    expect(models["visual-engineering"]).toBe("fast-model")
    expect(models["visual-looker"]).toBeUndefined()
    expect(models.quick).toBe("fast-model")
    expect(models["unspecified-low"]).toBe("fast-model")
    expect(models.writing).toBe("fast-model")
    expect(models.coding).toBe("coding-model")
    expect(models.reviewer).toBe("coding-model")
  })

  test("uses matching reasoning-effort routes for every owned model key", () => {
    const models = lfgOwnedSubagentModels()
    const efforts = lfgOwnedSubagentReasoningEffort()

    expect(Object.keys(efforts).sort()).toEqual(Object.keys(models).sort())
    expect(efforts.oracle).toBe("high")
    expect(efforts["visual-engineering"]).toBe("low")
    expect(efforts.reviewer).toBe("medium")
    expect(efforts.default).toBe("low")
    expect(efforts.sisyphus).toBe("low")
  })

  test("enables host built-ins and every routed OMO/Grok category subagent", () => {
    const toggles = Object.fromEntries(LFG_SUBAGENT_TOGGLES)
    const shadowDisabled: ReadonlySet<string> = new Set(GROK_SHADOW_ALIASES_DISABLED)

    for (const name of Object.keys(lfgOwnedSubagentModels())) {
      if (name === "default") continue
      if (shadowDisabled.has(name)) {
        expect(toggles[name]).toBe(false)
        continue
      }
      expect(toggles[name], name).toBe(true)
    }
  })

  test("host builtins enabled but spawn-map redirects to OMO personas (Option 2C)", () => {
    const toggles = Object.fromEntries(LFG_SUBAGENT_TOGGLES)

    for (const name of GROK_HOST_BUILTINS_ENABLED) {
      expect(toggles[name], name).toBe(true)
    }
    // Builtins redirect to OMO personas via spawn-map (host prompts cannot be overridden)
    expect(lfgSubagentForOmoSpawnType("general-purpose")).toBe("sisyphus")
    expect(lfgSubagentForOmoSpawnType("explore")).toBe("explorer")
    expect(lfgSubagentForOmoSpawnType("plan")).toBe("prometheus")
    // OMO personas remain available as identity-mapped specialists
    expect(toggles.explorer).toBe(true)
    expect(lfgSubagentForOmoSpawnType("explorer")).toBe("explorer")
    expect(toggles.sisyphus).toBe(true)
    expect(toggles.prometheus).toBe(true)
  })

  test("disables only shadow aliases that remap to lfg coding/reviewer", () => {
    const toggles = Object.fromEntries(LFG_SUBAGENT_TOGGLES)

    for (const name of GROK_SHADOW_ALIASES_DISABLED) {
      const replacement = lfgSubagentForOmoSpawnType(name)
      expect(toggles[name]).toBe(false)
      expect(toggles[replacement]).toBe(true)
    }
  })
})
