import { describe, expect, test } from "vitest"
import { applyModelPreset, type ModelDiscovery } from "./lfg-models"

const discovery: ModelDiscovery = {
  baseUrl: "http://127.0.0.1:8317/v1",
  modelsUrl: "http://127.0.0.1:8317/v1/models",
  modelIds: ["grok-4.3", "grok-4.20-0309-reasoning", "grok-4.20-0309-non-reasoning", "grok-3-mini-fast", "gpt-5.5", "glm-5.2", "glm-5-turbo", "gemini-3-flash", "gemini-3.1-pro-preview"],
  mapping: { default: "grok-4.3", fast: "grok-3-mini-fast", reasoning: "grok-4.20-0309-reasoning", coding: "grok-4.20-0309-non-reasoning" },
}

describe("setup model presets", () => {
  test("balanced preset uses GPT default, Gemini fast, Grok reasoning, and Grok coding", () => {
    const preset = applyModelPreset(discovery, "balanced")

    expect(preset.mapping).toEqual({
      default: "gpt-5.5",
      fast: "gemini-3-flash",
      reasoning: "grok-4.20-0309-reasoning",
      coding: "grok-4.20-0309-non-reasoning",
    })
    expect(preset.preset).toBe("balanced")
    expect(preset.providerEndpoints).toBeUndefined()
  })

  test("grok preset keeps Grok-specialized routing", () => {
    const preset = applyModelPreset(discovery, "grok")

    expect(preset.mapping.default).toBe("grok-4.3")
    expect(preset.mapping.fast).toBe("grok-3-mini-fast")
    expect(preset.preset).toBe("grok")
    expect(preset.providerEndpoints).toBeUndefined()
  })

  test("gemini and glm presets make those providers primary", () => {
    expect(applyModelPreset(discovery, "gemini").mapping.default).toBe("gemini-3.1-pro-preview")
    expect(applyModelPreset(discovery, "gemini").mapping.fast).toBe("gemini-3-flash")
    expect(applyModelPreset(discovery, "glm").mapping.default).toBe("glm-5.2")
    expect(applyModelPreset(discovery, "glm").mapping.coding).toBe("glm-5-turbo")
  })

  test("multi preset uses balanced routing and adds provider endpoint metadata", () => {
    const preset = applyModelPreset(discovery, "multi")

    expect(preset.mapping.default).toBe("gpt-5.5")
    expect(preset.mapping.fast).toBe("gemini-3-flash")
    expect(preset.preset).toBe("multi")
    expect(preset.providerEndpoints).toEqual(expect.arrayContaining([
      { id: "xai", baseUrl: "https://api.x.ai/v1", modelIds: ["grok-4.3", "grok-4.20-0309-reasoning", "grok-4.20-0309-non-reasoning", "grok-3-mini-fast"] },
      { id: "openai-compatible", baseUrl: "http://127.0.0.1:8317/v1", modelIds: ["gpt-5.5"] },
      { id: "glm", baseUrl: "https://open.bigmodel.cn/api/paas/v4", modelIds: ["glm-5.2", "glm-5-turbo"] },
      { id: "google", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", modelIds: ["gemini-3-flash", "gemini-3.1-pro-preview"] },
    ]))
  })
})
