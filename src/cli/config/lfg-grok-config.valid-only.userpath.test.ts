import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { writeGrokModelConfig } from "./lfg-grok-config"
import { purgeInvalidGrokModelSettings } from "../../grok/config/purge-invalid-model-settings"
import type { ModelDiscovery } from "../models/lfg-models"

const discovery: ModelDiscovery = {
  baseUrl: "http://127.0.0.1:20128/v1",
  modelsUrl: "http://127.0.0.1:20128/v1/models",
  modelIds: ["grok-4.5", "grok-composer-2.5-fast"],
  mapping: {
    default: "grok-4.5",
    fast: "grok-composer-2.5-fast",
    reasoning: "grok-4.5",
    coding: "grok-composer-2.5-fast",
  },
  contextWindows: { "grok-4.5": 175000, "grok-composer-2.5-fast": 175000 },
}

/**
 * Realistic broken user config shape observed on install surface:
 * empty [endpoints], unavailable Grok model_fallback values, orphan fallback
 * metadata, and a stale [model.*] section outside the host catalog.
 */
const brokenUserToml = `disabled_mcp_servers = [ "web-reader" ]

[endpoints]
[features]
support_permission = false

[models]
default = "grok-4.5"

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

[omo.agents.coding]
model = "grok-composer-2.5-fast"
reasoning_level = "medium"

[model."grok-4.5"]
model = "gcli/grok-4.5"
base_url = "http://127.0.0.1:20128/v1"
context_window = 175000

[model."grok-composer-2.5-fast"]
model = "gcli/grok-composer-2.5-fast"
base_url = "http://127.0.0.1:20128/v1"
context_window = 175000

[model."grok-4.20-0309-reasoning"]
model = "grok-4.20-0309-reasoning"
base_url = "http://127.0.0.1:20128/v1"
`

describe("install surface: valid-only config.toml (user path shape)", () => {
  test("writeGrokModelConfig + purge clears empty endpoints, stale models, unavailable fallbacks", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-valid-only-userpath-"))
    await mkdir(join(home, ".grok", "plugins", "lfg"), { recursive: true })
    await writeFile(join(home, ".grok", "config.toml"), brokenUserToml, "utf8")
    await writeFile(
      join(home, ".grok", "models_cache.json"),
      JSON.stringify({ models: { "grok-4.5": {}, "grok-composer-2.5-fast": {} } }),
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

    // Same order as runGrokInstall: write lfg-owned sections, then purge invalid routes.
    await writeGrokModelConfig(discovery, {
      home,
      apiKey: "sk-test",
      fullAgentModels: {
        plan: {
          model: "grok-4.5",
          reasoningLevel: "xhigh",
          modelFallback: "grok-4.20-0309-reasoning",
          modelFallbackReasoningLevel: "high",
        },
        explorer: {
          model: "grok-composer-2.5-fast",
          reasoningLevel: "low",
          modelFallback: "grok-4.20-0309-non-reasoning",
          modelFallbackReasoningLevel: "low",
        },
        coding: { model: "grok-composer-2.5-fast", reasoningLevel: "medium" },
      },
    })

    const purge = await purgeInvalidGrokModelSettings({
      home,
      discovery,
      allowModels: ["grok-4.5", "grok-composer-2.5-fast"],
    })

    const config = await readFile(join(home, ".grok", "config.toml"), "utf8")
    expect(config).toContain('models_base_url = "http://127.0.0.1:20128/v1"')
    expect(config).not.toMatch(/\[endpoints\]\s*\n\s*\[/)
    expect(config).not.toContain("grok-4.20-0309-reasoning")
    expect(config).not.toContain("grok-4.20-0309-non-reasoning")
    expect(config).not.toContain("model_fallback")
    expect(config).toContain('[model."grok-4.5"]')
    expect(config).toContain('[model."grok-composer-2.5-fast"]')
    expect(config).toContain('[model."grok-build"]')
    expect(purge.changed).toBe(true)

    const overrides = JSON.parse(await readFile(join(home, ".grok", "omo-agent-overrides.json"), "utf8")) as {
      overrides: { plan: { model: string; model_fallback?: string } }
    }
    expect(overrides.overrides.plan.model).toBe("grok-4.5")
    expect(overrides.overrides.plan.model_fallback).toBeUndefined()
  })
})
