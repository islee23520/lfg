import { describe, expect, test } from "vitest"
import { lfgSubagentForOmoSpawnType } from "../../core/lfg/subagents/omo-spawn-map"
import { LFG_SUBAGENT_TOGGLES, lfgOwnedSubagentModels, lfgOwnedSubagentReasoningEffort } from "./subagent-routing"

const GROK_BUILTIN_SUBAGENTS_REPLACED_BY_LFG = ["general-purpose", "explore", "grok-build", "builder"] as const

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
  })

  test("enables every routed OMO and Grok category subagent", () => {
    const toggles = Object.fromEntries(LFG_SUBAGENT_TOGGLES)
    const replacedBuiltins: ReadonlySet<string> = new Set(GROK_BUILTIN_SUBAGENTS_REPLACED_BY_LFG)

    for (const name of Object.keys(lfgOwnedSubagentModels())) {
      if (name === "default") continue
      expect(toggles[name]).toBe(!replacedBuiltins.has(name))
    }
  })

  test("disables Grok built-ins replaced by lfg OMO spawn targets", () => {
    const toggles = Object.fromEntries(LFG_SUBAGENT_TOGGLES)

    for (const name of GROK_BUILTIN_SUBAGENTS_REPLACED_BY_LFG) {
      const replacement = lfgSubagentForOmoSpawnType(name)

      expect(toggles[name]).toBe(false)
      expect(toggles[replacement]).toBe(true)
    }
  })
})
