import { describe, expect, test } from "bun:test"
import { loadOmoAgentRegistry } from "./agent-registry"
import { OMO_CATEGORY_MODEL_PROFILES, resolveModelProfile, resolveOmoModelProfile, validateModelProviderBoundary } from "./model-resolution"

describe("runtime-ts model resolution", () => {
  test("returns category profiles for supported categories", async () => {
    const result = await resolveOmoModelProfile("sisyphus-junior", { category: "quick" })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.modelProfile).toEqual(OMO_CATEGORY_MODEL_PROFILES.quick)
  })

  test("enforces Hephaestus GPT-style family", async () => {
    const hephaestus = (await loadOmoAgentRegistry()).find((agent) => agent.id === "hephaestus")
    expect(hephaestus).toBeDefined()
    const result = resolveModelProfile(hephaestus!, { provider: "xai", model: "xai/grok-4.3" })
    expect(result).toMatchObject({ ok: false, status: "blocked", error: "model-family mismatch" })
  })

  test("validates approved provider boundary", () => {
    expect(validateModelProviderBoundary("zai", undefined)).toBeNull()
    expect(validateModelProviderBoundary("anthropic", undefined)).toMatchObject({ ok: false, error: "unsupported model provider for LFG multi-provider OMO agents" })
  })
})
