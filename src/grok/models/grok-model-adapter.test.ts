import { describe, expect, test } from "vitest"
import {
  DEFAULT_PROVIDER_DESCRIPTORS,
  buildGrokModelCatalog,
  resolveGrokModel,
} from "./grok-model-adapter"
import { AGENT_MODEL_REQUIREMENTS, fuzzyMatchModel } from "../../core/omo/model-core"

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

  test("infers xai provider for Grok model ids", () => {
    const catalog = buildGrokModelCatalog({ modelIds: ["grok-4", "grok-3-mini"] })
    expect(catalog.availableModels.has("xai/grok-4")).toBe(true)
    expect(catalog.availableModels.has("xai/grok-3-mini")).toBe(true)
    expect(catalog.connectedProviders).toEqual(["xai"])
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
    // Only xai models available — OMO entries are skipped; table-tail xai wins.
    const catalog = buildGrokModelCatalog({ modelIds: ["grok-4", "grok-3-mini"] })
    const { resolved } = resolveGrokModel({
      catalog,
      requirementKey: "sisyphus",
      requirements: AGENT_MODEL_REQUIREMENTS,
    })
    expect(resolved).toBeDefined()
    expect(resolved?.provenance).toBe("provider-fallback")
    expect(resolved?.model).toContain("grok")
  })

  test("resolves via upstream chain when an upstream provider is connected", () => {
    const catalog = buildGrokModelCatalog({
      modelIds: ["grok-4", "openai/gpt-5.6-sol", "openai/gpt-5.5"],
      connectedProviders: ["xai", "openai"],
    })
    const { resolved } = resolveGrokModel({
      catalog,
      requirementKey: "hephaestus",
      requirements: AGENT_MODEL_REQUIREMENTS,
    })
    expect(resolved).toBeDefined()
    // hephaestus OMO chain prefers gpt-5.6-sol via openai before Grok tail.
    expect(resolved?.provenance).toBe("provider-fallback")
    expect(resolved?.model).toContain("gpt-5.6-sol")
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

  test("request keeps OMO chain first and Grok xai entries last", () => {
    const catalog = buildGrokModelCatalog({ modelIds: ["grok-4"] })
    const { request } = resolveGrokModel({
      catalog,
      requirementKey: "sisyphus",
      requirements: AGENT_MODEL_REQUIREMENTS,
    })
    const chain = request.policy?.fallbackChain
    expect(chain).toBeDefined()
    expect(chain?.[0]?.model).toBe("claude-opus-4-7")
    // Table already has xai tails; adapter must not need to append another.
    const last = chain?.[chain.length - 1]
    expect(last?.providers).toContain("xai")
    expect(last?.model).toMatch(/^grok/)
    // First xai entry appears after at least one non-xai OMO entry.
    const firstXai = chain?.findIndex((e) => e.providers.includes("xai"))
    expect(firstXai).toBeGreaterThan(0)
  })
})

describe("model-core-vendored sanity (Grok gap confirmation)", () => {
  test("fuzzyMatchModel matches provider-qualified ids", () => {
    const available = new Set(["xai/grok-4", "openai/gpt-5.5"])
    expect(fuzzyMatchModel("grok-4", available)).toBe("xai/grok-4")
    expect(fuzzyMatchModel("gpt-5.5", available)).toBe("openai/gpt-5.5")
  })
})

describe("DEFAULT_PROVIDER_DESCRIPTORS", () => {
  test("includes xai for Grok first-party models", () => {
    expect(DEFAULT_PROVIDER_DESCRIPTORS.some((d) => d.providerId === "xai")).toBe(true)
  })
})
