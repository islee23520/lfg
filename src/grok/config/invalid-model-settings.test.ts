import { describe, expect, test } from "vitest"
import {
  isForeignProviderModel,
  modelIsAvailable,
  pickRoleFallbacks,
  roleFallbackForAgent,
  shouldRemapUnavailableModel,
} from "./invalid-model-settings"
import { purgeInvalidModelSettingsToml } from "./purge-invalid-model-settings-toml"

describe("purgeInvalidModelSettingsToml", () => {
  test("strips invalid agent and model routing tables plus missing plugins", () => {
    const source = `
[plugins]
enabled = [
    "lfg",
    "ocx-models",
    "vercel",
]

[subagents.models]
default = "grok-4.5"
hephaestus = "gpt-5.5"
explore = "gpt-5.4-mini"
coding = "grok-build-0.1"

[model."grok-4.5"]
model = "grok-4.5"

[model."gpt-5.5"]
model = "gpt-5.5"
base_url = "http://127.0.0.1:10100/v1"

[omo.agents.plan]
model = "gpt-5.5"
model_fallback = "gemini-3-pro"
reasoning_level = "xhigh"

[omo.models]
default = "gpt-5.5"
fast = "gpt-5.4-mini"
reasoning = "gpt-5.5"
coding = "gpt-5.3-codex-spark"
`
    const available = new Set(["grok-4.5", "grok-composer-2.5-fast"])
    const installed = new Set(["lfg"])
    const result = purgeInvalidModelSettingsToml(source, available, installed)

    expect(result.removedPluginIds).toEqual(["ocx-models", "vercel"])
    expect(result.removedModelSections).toContain("gpt-5.5")
    expect(result.next).not.toContain('[model."gpt-5.5"]')
    expect(result.next).not.toContain("[model.")
    expect(result.next).not.toContain("[subagents.models]")
    expect(result.next).not.toContain("[omo.agents")
    expect(result.next).not.toContain("grok-build-0.1")
    expect(result.next).not.toContain("gpt-5.5")
    expect(result.next).not.toContain("gemini-3-pro")
    expect(result.remappedRoutes).toEqual([])
  })

  test("strips unavailable Grok model_fallback and orphan fallback metadata", () => {
    const source = `
[omo.agents.plan]
model = "grok-4.5"
model_fallback = "grok-4.20-0309-reasoning"
model_fallback_reasoning_level = "high"
reasoning_level = "xhigh"

[omo.agents.explorer]
model = "grok-composer-2.5-fast"
model_fallback = "grok-4.20-0309-non-reasoning"
model_fallback_reasoning_level = "low"
reasoning_level = "low"
`
    const result = purgeInvalidModelSettingsToml(
      source,
      new Set(["grok-4.5", "grok-composer-2.5-fast"]),
      new Set(["lfg"]),
    )
    expect(result.next).not.toContain("grok-4.20-0309-reasoning")
    expect(result.next).not.toContain("grok-4.20-0309-non-reasoning")
    expect(result.next).not.toContain("model_fallback")
    expect(result.next).not.toContain("[omo.agents")
    expect(result.remappedRoutes).toEqual([])
  })

  test("drops stale Grok [model.*] sections missing from the catalog", () => {
    const source = `
[model."grok-4.5"]
model = "grok-4.5"

[model."grok-4.20-0309-reasoning"]
model = "grok-4.20-0309-reasoning"
base_url = "http://127.0.0.1:20128/v1"

[model."custom-plan"]
model = "custom-plan"
`
    const result = purgeInvalidModelSettingsToml(
      source,
      new Set(["grok-4.5", "grok-composer-2.5-fast"]),
      new Set(["lfg"]),
    )
    expect(result.removedModelSections).toContain("grok-4.20-0309-reasoning")
    expect(result.next).not.toContain('[model."grok-4.5"]')
    expect(result.next).not.toContain("grok-4.20-0309-reasoning")
    expect(result.next).not.toContain('[model."custom-plan"]')
  })

  test("strips missing plugins from single-line enabled arrays", () => {
    const source = `[plugins]\nenabled = ["lfg", "ocx-models", "vercel"]\n\n[subagents.models]\nplan = "gpt-5.5"\n`
    const result = purgeInvalidModelSettingsToml(source, new Set(["grok-4.5"]), new Set(["lfg"]))
    expect(result.removedPluginIds).toEqual(["ocx-models", "vercel"])
    expect(result.next).not.toContain("ocx-models")
    expect(result.next).toContain('"lfg"')
    expect(result.next).not.toContain("[subagents.models]")
  })

  test("strips custom ids when they are inside retired host routing tables", () => {
    const source = `
[subagents.models]
plan = "custom-plan"
[omo.agents.plan]
model = "custom-plan"
reasoning_level = "xhigh"
`
    const result = purgeInvalidModelSettingsToml(source, new Set(["grok-4.5"]), new Set(["lfg"]))
    expect(result.next).not.toContain("custom-plan")
    expect(result.remappedRoutes).toEqual([])
  })

  test("no-ops when available catalog is empty", () => {
    const source = `[subagents.models]\nplan = "gpt-5.5"\n`
    const result = purgeInvalidModelSettingsToml(source, new Set(), new Set(["lfg"]))
    expect(result.next).toBe(source)
    expect(result.remappedRoutes).toEqual([])
  })
})

describe("model availability helpers", () => {
  test("with a non-empty catalog, only catalog members are available", () => {
    expect(modelIsAvailable("grok-build-0.1", new Set(["grok-4.5"]))).toBe(false)
    expect(modelIsAvailable("grok-4.20-0309-reasoning", new Set(["grok-4.5"]))).toBe(false)
    expect(modelIsAvailable("xai/grok-4.5", new Set(["grok-4.5"]))).toBe(true)
    expect(modelIsAvailable("grok-4.5", new Set(["grok-4.5"]))).toBe(true)
    expect(modelIsAvailable("gpt-5.5", new Set(["grok-4.5"]))).toBe(false)
  })

  test("with an empty catalog, Grok-family ids are allowed as host-native defaults", () => {
    expect(modelIsAvailable("grok-4.5", new Set())).toBe(true)
    expect(modelIsAvailable("grok-composer-2.5-fast", new Set())).toBe(true)
    expect(modelIsAvailable("gpt-5.5", new Set())).toBe(false)
  })

  test("treats non-xai provider prefixes as foreign (401-prone without CLI proxy)", () => {
    expect(isForeignProviderModel("cx/gpt-5.6-sol")).toBe(true)
    expect(isForeignProviderModel("openai/gpt-5.5")).toBe(true)
    expect(isForeignProviderModel("anthropic/claude-opus-4-7")).toBe(true)
    expect(isForeignProviderModel("xai/grok-4.5")).toBe(false)
    expect(isForeignProviderModel("grok-4.5")).toBe(false)
    expect(shouldRemapUnavailableModel("cx/gpt-5.6-sol", new Set(["grok-4.5"]))).toBe(true)
  })

  test("strips models.default and model blocks from config", () => {
    const source = `
[models]
default = "cx/gpt-5.6-sol"
default_reasoning_effort = "high"

[model."grok-4.5"]
model = "grok-4.5"
`
    const result = purgeInvalidModelSettingsToml(source, new Set(["grok-4.5", "grok-composer-2.5-fast"]), new Set(["lfg"]))
    expect(result.next).not.toContain("[models]")
    expect(result.next).not.toContain("cx/gpt-5.6-sol")
    expect(result.remappedRoutes).toEqual([])
  })

  test("role fallbacks prefer composer for fast/coding", () => {
    const fallbacks = pickRoleFallbacks(["grok-4.5", "grok-composer-2.5-fast"])
    expect(roleFallbackForAgent("explorer", fallbacks)).toBe("grok-composer-2.5-fast")
    expect(roleFallbackForAgent("plan", fallbacks)).toBe("grok-4.5")
    expect(roleFallbackForAgent("coding", fallbacks)).toBe("grok-composer-2.5-fast")
  })
})
