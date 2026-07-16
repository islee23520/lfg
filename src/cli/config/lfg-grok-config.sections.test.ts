import { describe, expect, test } from "vitest"
import { LFG_OWNED_GROK_CONFIG_SECTIONS } from "./lfg-grok-config"

describe("LFG_OWNED_GROK_CONFIG_SECTIONS (#29)", () => {
  test("documents all managed config.toml areas", () => {
    expect(LFG_OWNED_GROK_CONFIG_SECTIONS).toContain("endpoints.models_base_url")
    expect(LFG_OWNED_GROK_CONFIG_SECTIONS).toContain("omo.providers")
    expect(LFG_OWNED_GROK_CONFIG_SECTIONS).toContain("models.default")
    expect(LFG_OWNED_GROK_CONFIG_SECTIONS).not.toContain("omo.models")
    expect(LFG_OWNED_GROK_CONFIG_SECTIONS).not.toContain("omo.agents")
    expect(LFG_OWNED_GROK_CONFIG_SECTIONS).not.toContain("model.*")
    expect(LFG_OWNED_GROK_CONFIG_SECTIONS.join(" ")).not.toContain("api_key")
  })
})
