import { describe, expect, test } from "vitest"

import { buildVanillaGrokConfig, formatVanillaSummary, isGrokModel, pickGrokModel } from "./lfg-setup-tui-data"
import type { ModelDiscovery } from "../models/lfg-models"
import { loadBundledDefaultOmoOverrides } from "../../grok/agents/lazycodex-agent-overrides"

describe("buildVanillaGrokConfig", () => {
  test("every agent resolves to a Grok-native model even when bundled primaries are GPT", async () => {
    const bundled = await loadBundledDefaultOmoOverrides()
    const cfg = buildVanillaGrokConfig(bundled, undefined)

    // Role agents are Grok.
    expect(isGrokModel(cfg.agentConfig.explorer.model)).toBe(true)
    expect(isGrokModel(cfg.agentConfig.reasoning.model)).toBe(true)
    expect(isGrokModel(cfg.agentConfig.coding.model)).toBe(true)

    // Every named override is Grok (vanilla must never pin a GPT/GLM primary).
    for (const [name, override] of Object.entries(cfg.agentOverrideMap)) {
      expect(isGrokModel(override.model)).toBe(true)
    }
    expect(Object.keys(cfg.agentOverrideMap).sort()).toEqual(Object.keys(bundled).sort())

    // Mapping slots are Grok.
    expect(isGrokModel(cfg.mapping.default)).toBe(true)
    expect(isGrokModel(cfg.mapping.fast)).toBe(true)
    expect(isGrokModel(cfg.mapping.reasoning)).toBe(true)
    expect(isGrokModel(cfg.mapping.coding)).toBe(true)
  })

  test("explorer defaults to a fast Grok model and reasoning to a deep Grok model", async () => {
    const bundled = await loadBundledDefaultOmoOverrides()
    const cfg = buildVanillaGrokConfig(bundled, undefined)
    expect(cfg.mapping.fast).toBe(cfg.agentConfig.explorer.model)
    expect(cfg.mapping.reasoning).toBe(cfg.agentConfig.reasoning.model)
  })

  test("vanilla selects Grok 4.5 and Composer from discovery while excluding unusable Grok 3", async () => {
    const bundled = await loadBundledDefaultOmoOverrides()
    const discoveryWithGrok3And4: ModelDiscovery = {
      baseUrl: "https://api.x.ai/v1",
      modelsUrl: "https://api.x.ai/v1/models",
      modelIds: ["grok-4", "grok-4.5", "grok-4.3", "grok-3-mini-fast", "grok-build-0.1", "grok-4.20-0309-reasoning", "grok-composer-2.5-fast"],
      mapping: { default: "grok-4", fast: "grok-3-mini-fast", reasoning: "grok-4.3", coding: "grok-4" },
    }
    const cfg = buildVanillaGrokConfig(bundled, discoveryWithGrok3And4)

    expect(cfg.mapping.default).toBe("grok-4.5")
    expect(cfg.mapping.fast).toBe("grok-composer-2.5-fast")
    expect(cfg.mapping.reasoning).toBe("grok-4.5")
    expect(cfg.mapping.coding).toBe("grok-composer-2.5-fast")
    expect(formatVanillaSummary(cfg)).toContain("default: grok-4.5")
    expect(formatVanillaSummary(cfg)).toContain("fast: grok-composer-2.5-fast")
    expect(formatVanillaSummary(cfg)).not.toContain("grok-3-mini-fast")
  })

  test("vanilla without discovery defaults to grok-4.5 for default and reasoning", async () => {
    const bundled = await loadBundledDefaultOmoOverrides()
    const cfg = buildVanillaGrokConfig(bundled, undefined)
    expect(cfg.mapping.default).toBe("grok-4.5")
    expect(cfg.mapping.reasoning).toBe("grok-4.5")
    expect(cfg.mapping.fast).toBe("grok-composer-2.5-fast")
    expect(cfg.mapping.coding).toBe("grok-composer-2.5-fast")
  })

  test("pickGrokModel prefers usable grok primary, then usable grok fallback, then role default", () => {
    expect(pickGrokModel("grok-4.5", "gpt-5.4-mini", "grok-4.5")).toBe("grok-4.5")
    expect(pickGrokModel("gpt-5.5", "grok-4.20-0309-reasoning", "grok-4.20-0309-non-reasoning")).toBe("grok-4.20-0309-reasoning")
    expect(pickGrokModel("grok-3-mini-fast", "gpt-5.4-mini", "grok-4.5")).toBe("grok-4.5")
    expect(pickGrokModel("gpt-5.5", "glm-5", "grok-4.5")).toBe("grok-4.5")
    expect(pickGrokModel(undefined, undefined, "grok-4.5")).toBe("grok-4.5")
  })

  test("isGrokModel recognizes grok ids and rejects non-grok", () => {
    expect(isGrokModel("grok-4.5")).toBe(true)
    expect(isGrokModel("grok-4.3")).toBe(true)
    expect(isGrokModel("grok-3-mini-fast")).toBe(true)
    expect(isGrokModel("grok-build")).toBe(true)
    expect(isGrokModel("gpt-5.5")).toBe(false)
    expect(isGrokModel(undefined)).toBe(false)
  })
})
