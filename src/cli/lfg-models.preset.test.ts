import { describe, expect, test } from "vitest"
import { applyModelPreset, type ModelDiscovery } from "./lfg-models"

const discovery: ModelDiscovery = {
  baseUrl: "http://127.0.0.1:8317/v1",
  modelsUrl: "http://127.0.0.1:8317/v1/models",
  modelIds: ["grok-4.3", "gpt-5.5", "glm-5.2", "gemini-3-pro"],
  mapping: { default: "grok-4.3", fast: "grok-4.3", reasoning: "gpt-5.5", coding: "gpt-5.5" },
}

describe("setup model presets", () => {
  test("default grok preset stays single-endpoint and Grok-first", () => {
    const preset = applyModelPreset(discovery, "grok")

    expect(preset.mapping.default).toBe("gpt-5.5")
    expect(preset.preset).toBe("grok")
    expect(preset.providerEndpoints).toBeUndefined()
  })

  test("multi preset keeps Grok-first routing and adds provider endpoint metadata", () => {
    const preset = applyModelPreset(discovery, "multi")

    expect(preset.mapping.default).toBe("gpt-5.5")
    expect(preset.preset).toBe("multi")
    expect(preset.providerEndpoints).toEqual(expect.arrayContaining([
      { id: "xai", baseUrl: "https://api.x.ai/v1", modelIds: ["grok-4.3"] },
      { id: "openai-compatible", baseUrl: "http://127.0.0.1:8317/v1", modelIds: ["gpt-5.5"] },
      { id: "glm", baseUrl: "https://open.bigmodel.cn/api/paas/v4", modelIds: ["glm-5.2"] },
      { id: "google", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", modelIds: ["gemini-3-pro"] },
    ]))
  })
})
