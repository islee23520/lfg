import { describe, expect, test } from "vitest"
import { applyModelPreset, type ModelDiscovery } from "./lfg-models"

const discovery: ModelDiscovery = {
  baseUrl: "http://127.0.0.1:8317/v1",
  modelsUrl: "http://127.0.0.1:8317/v1/models",
  modelIds: ["grok-4.5", "grok-build-0.1", "grok-4.3", "grok-4.20-0309-reasoning", "grok-4.20-0309-non-reasoning", "grok-composer-2.5-fast", "grok-3-mini-fast", "gpt-5.5", "glm-5.2", "glm-5-turbo", "gemini-3-flash", "gemini-3.1-pro-preview"],
  mapping: { default: "grok-4.5", fast: "grok-composer-2.5-fast", reasoning: "grok-4.5", coding: "grok-composer-2.5-fast" },
}

describe("setup model presets", () => {
  test("balanced preset uses GPT default, Gemini fast, Grok 4.5 reasoning, and Composer coding", () => {
    const preset = applyModelPreset(discovery, "balanced")

    expect(preset.mapping).toEqual({
      default: "gpt-5.5",
      fast: "gemini-3-flash",
      reasoning: "grok-4.5",
      coding: "grok-composer-2.5-fast",
    })
    expect(preset.preset).toBe("balanced")
    expect(preset.providerEndpoints).toBeUndefined()
  })

  test("auto preset uses discovered Grok 4.5 for orchestration and role models", () => {
    const preset = applyModelPreset(discovery, "auto")

    expect(preset.mapping.default).toBe("grok-4.5")
    expect(preset.mapping.fast).toBe("grok-composer-2.5-fast")
    expect(preset.mapping.reasoning).toBe("grok-4.5")
    expect(preset.mapping.coding).toBe("grok-composer-2.5-fast")
    expect(discovery.modelIds).toEqual(expect.arrayContaining(Object.values(preset.mapping)))
    expect(preset.mapping.fast).not.toBe("grok-3-mini-fast")
  })

  test("auto preset never invents preferred models that discovery did not return", () => {
    const sparseDiscovery: ModelDiscovery = {
      baseUrl: "http://127.0.0.1:8317/v1",
      modelsUrl: "http://127.0.0.1:8317/v1/models",
      modelIds: ["local-small", "local-reasoning"],
      mapping: { default: "local-small", fast: "local-small", reasoning: "local-reasoning", coding: "local-small" },
    }

    const preset = applyModelPreset(sparseDiscovery, "auto")

    expect(Object.values(preset.mapping).every((model) => sparseDiscovery.modelIds.includes(model))).toBe(true)
    expect(preset.mapping).toEqual({
      default: "local-small",
      fast: "local-small",
      reasoning: "local-reasoning",
      coding: "local-small",
    })
  })

  test("grok preset keeps Grok-specialized routing", () => {
    const preset = applyModelPreset(discovery, "grok")

    expect(preset.mapping.default).toBe("grok-4.5")
    expect(preset.mapping.fast).toBe("grok-composer-2.5-fast")
    expect(preset.mapping.reasoning).toBe("grok-4.5")
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
      { id: "xai", baseUrl: "https://api.x.ai/v1", modelIds: ["grok-4.5", "grok-build-0.1", "grok-4.3", "grok-4.20-0309-reasoning", "grok-4.20-0309-non-reasoning", "grok-composer-2.5-fast", "grok-3-mini-fast"] },
      { id: "openai-compatible", baseUrl: "http://127.0.0.1:8317/v1", modelIds: ["gpt-5.5"] },
      { id: "glm", baseUrl: "https://open.bigmodel.cn/api/paas/v4", modelIds: ["glm-5.2", "glm-5-turbo"] },
      { id: "google", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", modelIds: ["gemini-3-flash", "gemini-3.1-pro-preview"] },
    ]))
  })
})
