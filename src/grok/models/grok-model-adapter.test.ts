import { describe, expect, test } from "vitest"
import {
  DEFAULT_PROVIDER_DESCRIPTORS,
  buildGrokModelCatalog,
  resolveGrokModel,
} from "./grok-model-adapter"
import { AGENT_MODEL_REQUIREMENTS, fuzzyMatchModel, isGptModel, isGeminiModel } from "../../core/omo/model-core"

describe("buildGrokModelCatalog", () => {
  test("normalizes bare Grok model ids to xai/provider form", () => {
    const catalog = buildGrokModelCatalog({ modelIds: ["grok-4", "grok-3-mini"] })
    expect(catalog.availableModels.has("xai/grok-4")).toBe(true)
    expect(catalog.availableModels.has("xai/grok-3-mini")).toBe(true)
    expect(catalog.connectedProviders).toContain("xai")
  })

  test("preserves already provider-qualified ids", () => {
    const catalog = buildGrokModelCatalog({ modelIds: ["openai/gpt-5.5", "anthropic/claude-opus-4-7"] })
    expect(catalog.availableModels.has("openai/gpt-5.5")).toBe(true)
    expect(catalog.availableModels.has("anthropic/claude-opus-4-7")).toBe(true)
    expect(catalog.connectedProviders).toContain("openai")
    expect(catalog.connectedProviders).toContain("anthropic")
  })

  test("infers provider from prefix for mixed catalogs", () => {
    const catalog = buildGrokModelCatalog({ modelIds: ["grok-4", "gpt-5.5", "claude-opus-4-7", "gemini-3-pro"] })
    expect(catalog.availableModels.has("xai/grok-4")).toBe(true)
    expect(catalog.availableModels.has("openai/gpt-5.5")).toBe(true)
    expect(catalog.availableModels.has("anthropic/claude-opus-4-7")).toBe(true)
    expect(catalog.availableModels.has("google/gemini-3-pro")).toBe(true)
  })

  test("honors explicit connectedProviders override", () => {
    const catalog = buildGrokModelCatalog({ modelIds: ["grok-4"], connectedProviders: ["xai", "openai"] })
    expect(catalog.connectedProviders).toEqual(["xai", "openai"])
  })

  test("ignores empty/whitespace model ids", () => {
    const catalog = buildGrokModelCatalog({ modelIds: ["", "  ", "grok-4"] })
    expect(catalog.availableModels.size).toBe(1)
    expect(catalog.availableModels.has("xai/grok-4")).toBe(true)
  })
})

describe("resolveGrokModel", () => {
  test("UI-selected model wins as override", () => {
    const catalog = buildGrokModelCatalog({ modelIds: ["grok-4", "gpt-5.5"] })
    const { resolved } = resolveGrokModel({
      catalog,
      requirementKey: "sisyphus",
      requirements: AGENT_MODEL_REQUIREMENTS,
      uiSelectedModel: "xai/grok-4",
    })
    expect(resolved?.model).toBe("xai/grok-4")
    expect(resolved?.provenance).toBe("override")
  })

  test("falls back to a Grok (xai) model when no upstream provider matches", () => {
    // Only xai models available — upstream sisyphus chain has no xai entry,
    // so our adapter appends a Grok fallback entry.
    const catalog = buildGrokModelCatalog({ modelIds: ["grok-4", "grok-3-mini"] })
    const { resolved } = resolveGrokModel({
      catalog,
      requirementKey: "sisyphus",
      requirements: AGENT_MODEL_REQUIREMENTS,
    })
    expect(resolved).toBeDefined()
    expect(resolved?.provenance).toBe("provider-fallback")
    // The resolved model should be an xai model.
    expect(resolved?.model).toContain("grok")
  })

  test("resolves via upstream chain when an upstream provider is connected", () => {
    const catalog = buildGrokModelCatalog({
      modelIds: ["grok-4", "gpt-5.5"],
      connectedProviders: ["xai", "openai"],
    })
    const { resolved } = resolveGrokModel({
      catalog,
      requirementKey: "hephaestus",
      requirements: AGENT_MODEL_REQUIREMENTS,
    })
    expect(resolved).toBeDefined()
    // hephaestus upstream chain prefers gpt-5.5 via openai.
    expect(resolved?.provenance).toBe("provider-fallback")
  })

  test("returns undefined when no systemDefaultModel and nothing resolves", () => {
    const catalog = buildGrokModelCatalog({ modelIds: [], connectedProviders: [] })
    const { resolved } = resolveGrokModel({
      catalog,
      requirementKey: "sisyphus",
      requirements: AGENT_MODEL_REQUIREMENTS,
    })
    expect(resolved).toBeUndefined()
  })

  test("systemDefaultModel is used as last resort", () => {
    const catalog = buildGrokModelCatalog({ modelIds: [], connectedProviders: [] })
    const { resolved } = resolveGrokModel({
      catalog,
      requirementKey: "sisyphus",
      requirements: AGENT_MODEL_REQUIREMENTS,
      systemDefaultModel: "xai/grok-4",
    })
    expect(resolved?.model).toBe("xai/grok-4")
    expect(resolved?.provenance).toBe("system-default")
  })

  test("request includes the Grok-appended fallback entry", () => {
    const catalog = buildGrokModelCatalog({ modelIds: ["grok-4"] })
    const { request } = resolveGrokModel({
      catalog,
      requirementKey: "sisyphus",
      requirements: AGENT_MODEL_REQUIREMENTS,
    })
    const chain = request.policy?.fallbackChain
    expect(chain).toBeDefined()
    // The last entry should be the Grok (xai) fallback.
    const last = chain?.[chain.length - 1]
    expect(last?.providers).toContain("xai")
  })
})

describe("model-core-vendored sanity (Grok gap confirmation)", () => {
  test("fuzzyMatchModel matches provider-qualified ids", () => {
    const available = new Set(["xai/grok-4", "openai/gpt-5.5"])
    expect(fuzzyMatchModel("grok-4", available)).toBe("xai/grok-4")
    expect(fuzzyMatchModel("gpt-5.5", available)).toBe("openai/gpt-5.5")
  })

  test("Grok models do not match OpenAI/Claude family detectors (the gap)", () => {
    expect(isGptModel("xai/grok-4")).toBe(false)
    expect(isGeminiModel("xai/grok-4")).toBe(false)
    // This confirms why Phase 2 needs the Grok adapter fallback entry.
  })
})

describe("DEFAULT_PROVIDER_DESCRIPTORS", () => {
  test("includes xai for Grok first-party models", () => {
    expect(DEFAULT_PROVIDER_DESCRIPTORS.some((d) => d.providerId === "xai")).toBe(true)
  })
})
