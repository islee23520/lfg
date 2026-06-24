import { describe, expect, test } from "vitest"

import { buildVanillaGrokConfig, isGrokModel, pickGrokModel } from "./lfg-setup-tui-data"
import { loadBundledDefaultOmoOverrides } from "../../grok/agents/lazycodex-agent-overrides"

describe("buildVanillaGrokConfig", () => {
  test("every agent resolves to a Grok-native model even when bundled primaries are GPT", async () => {
    const bundled = await loadBundledDefaultOmoOverrides()
    const cfg = buildVanillaGrokConfig(bundled)

    // Role agents are Grok.
    expect(isGrokModel(cfg.agentConfig.explorer.model)).toBe(true)
    expect(isGrokModel(cfg.agentConfig.reasoning.model)).toBe(true)
    expect(isGrokModel(cfg.agentConfig.coding.model)).toBe(true)

    // Every named override is Grok (vanilla must never pin a GPT/GLM primary).
    for (const [name, override] of Object.entries(cfg.agentOverrideMap)) {
      expect(isGrokModel(override.model)).toBe(true)
    }

    // Mapping slots are Grok.
    expect(isGrokModel(cfg.mapping.default)).toBe(true)
    expect(isGrokModel(cfg.mapping.fast)).toBe(true)
    expect(isGrokModel(cfg.mapping.reasoning)).toBe(true)
    expect(isGrokModel(cfg.mapping.coding)).toBe(true)
  })

  test("explorer defaults to a fast Grok model and reasoning to a deep Grok model", async () => {
    const bundled = await loadBundledDefaultOmoOverrides()
    const cfg = buildVanillaGrokConfig(bundled)
    expect(cfg.mapping.fast).toBe(cfg.agentConfig.explorer.model)
    expect(cfg.mapping.reasoning).toBe(cfg.agentConfig.reasoning.model)
  })

  test("pickGrokModel prefers grok primary, then grok fallback, then role default", () => {
    expect(pickGrokModel("grok-3-mini-fast", "gpt-5.4-mini", "grok-4.20-0309-reasoning")).toBe("grok-3-mini-fast")
    expect(pickGrokModel("gpt-5.5", "grok-4.20-0309-reasoning", "grok-4.20-0309-non-reasoning")).toBe("grok-4.20-0309-reasoning")
    expect(pickGrokModel("gpt-5.5", "glm-5", "grok-4.20-0309-reasoning")).toBe("grok-4.20-0309-reasoning")
    expect(pickGrokModel(undefined, undefined, "grok-4.3")).toBe("grok-4.3")
  })

  test("isGrokModel recognizes grok ids and rejects non-grok", () => {
    expect(isGrokModel("grok-4.3")).toBe(true)
    expect(isGrokModel("grok-3-mini-fast")).toBe(true)
    expect(isGrokModel("grok-build")).toBe(true)
    expect(isGrokModel("gpt-5.5")).toBe(false)
    expect(isGrokModel(undefined)).toBe(false)
  })
})
