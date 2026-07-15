import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { purgeInvalidGrokModelSettings } from "./purge-invalid-model-settings"

describe("purgeInvalidGrokModelSettings", () => {
  test("Given invalid routes and a host models_cache, When doctor/setup purge runs, Then gpt routes are remapped and missing plugins removed", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-purge-models-"))
    await mkdir(join(home, ".grok", "plugins", "lfg"), { recursive: true })
    await writeFile(
      join(home, ".grok", "models_cache.json"),
      JSON.stringify({ models: { "grok-4.5": {}, "grok-composer-2.5-fast": {} } }),
      "utf8",
    )
    await writeFile(
      join(home, ".grok", "config.toml"),
      `
[plugins]
enabled = [
    "lfg",
    "ocx-models",
]

[subagents.models]
plan = "gpt-5.5"
explore = "gpt-5.4-mini"
coding = "grok-build-0.1"

[omo.agents.plan]
model = "gpt-5.5"
model_fallback = "gemini-3-pro"
reasoning_level = "xhigh"
`,
      "utf8",
    )
    await writeFile(
      join(home, ".grok", "omo-agent-overrides.json"),
      JSON.stringify({
        version: 1,
        overrides: {
          plan: {
            model: "gpt-5.5",
            reasoning_level: "xhigh",
            model_fallback: "gemini-3-pro",
          },
        },
      }),
      "utf8",
    )

    const result = await purgeInvalidGrokModelSettings({ home })
    expect(result.changed).toBe(true)
    expect(result.skipped).toBe(false)
    expect(result.removedPluginIds).toContain("ocx-models")
    expect(result.remappedRoutes.some((route) => route.from === "gpt-5.5")).toBe(true)

    const config = await readFile(join(home, ".grok", "config.toml"), "utf8")
    expect(config).not.toContain("gpt-5.5")
    expect(config).not.toContain("ocx-models")
    expect(config).toContain('plan = "grok-4.5"')
    expect(config).toContain('explore = "grok-composer-2.5-fast"')
    // Unavailable Grok id remaps to coding role fallback (composer when present in catalog).
    expect(config).toContain('coding = "grok-composer-2.5-fast"')
    expect(config).not.toContain("grok-build-0.1")

    const overrides = JSON.parse(await readFile(join(home, ".grok", "omo-agent-overrides.json"), "utf8")) as {
      overrides: { plan: { model: string; model_fallback?: string } }
    }
    expect(overrides.overrides.plan.model).toBe("grok-4.5")
    expect(overrides.overrides.plan.model_fallback).toBeUndefined()
  })

  test("Given no models_cache but foreign models.default, When purge runs, Then default is remapped to Grok safety net (no 401)", async () => {
    // Given: host-auth session with no discovery cache; user set an unauthenticated foreign default.
    const home = await mkdtemp(join(tmpdir(), "lfg-purge-no-cache-foreign-default-"))
    await mkdir(join(home, ".grok", "plugins", "lfg"), { recursive: true })
    await writeFile(
      join(home, ".grok", "config.toml"),
      `
[models]
default = "cx/gpt-5.6-sol"
default_reasoning_effort = "high"

[plugins]
enabled = ["lfg"]

[model."grok-4.5"]
model = "grok-4.5"
`,
      "utf8",
    )

    // When: purge runs without models_cache / discovery.
    const result = await purgeInvalidGrokModelSettings({ home })

    // Then: foreign default is remapped so host auth no longer 401s after recovery.
    expect(result.changed).toBe(true)
    expect(result.remappedRoutes.some((r) => r.location === "models.default" && r.from === "cx/gpt-5.6-sol")).toBe(true)
    const config = await readFile(join(home, ".grok", "config.toml"), "utf8")
    expect(config).toContain('default = "grok-4.5"')
    expect(config).not.toContain("cx/gpt-5.6-sol")
  })

  test("Given only catalog models in cache, When purge runs, Then unavailable Grok fallbacks are stripped from overrides and toml", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-purge-valid-only-"))
    await mkdir(join(home, ".grok", "plugins", "lfg"), { recursive: true })
    await writeFile(
      join(home, ".grok", "models_cache.json"),
      JSON.stringify({ models: { "grok-4.5": {}, "grok-composer-2.5-fast": {} } }),
      "utf8",
    )
    await writeFile(
      join(home, ".grok", "config.toml"),
      `
[endpoints]

[omo.agents.plan]
model = "grok-4.5"
model_fallback = "grok-4.20-0309-reasoning"
model_fallback_reasoning_level = "high"
reasoning_level = "xhigh"

[model."grok-4.5"]
model = "grok-4.5"

[model."grok-4.20-0309-reasoning"]
model = "grok-4.20-0309-reasoning"
`,
      "utf8",
    )
    await writeFile(
      join(home, ".grok", "omo-agent-overrides.json"),
      JSON.stringify({
        version: 1,
        overrides: {
          plan: {
            model: "grok-4.5",
            reasoning_level: "xhigh",
            model_fallback: "grok-4.20-0309-reasoning",
            model_fallback_reasoning_effort: "high",
          },
        },
      }),
      "utf8",
    )

    const result = await purgeInvalidGrokModelSettings({ home })
    expect(result.changed).toBe(true)
    expect(result.skipped).toBe(false)
    expect(result.removedModelSections).toContain("grok-4.20-0309-reasoning")

    const config = await readFile(join(home, ".grok", "config.toml"), "utf8")
    expect(config).not.toContain("grok-4.20-0309-reasoning")
    expect(config).not.toContain("model_fallback")
    expect(config).toContain('model = "grok-4.5"')

    const overrides = JSON.parse(await readFile(join(home, ".grok", "omo-agent-overrides.json"), "utf8")) as {
      overrides: { plan: { model: string; model_fallback?: string } }
    }
    expect(overrides.overrides.plan.model).toBe("grok-4.5")
    expect(overrides.overrides.plan.model_fallback).toBeUndefined()
  })
})
