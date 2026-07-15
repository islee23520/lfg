import { mkdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import {
  catalogLooksLikeCliProxy,
  parseGrokModelCatalogFromConfigToml,
  readGrokModelCatalogFromHome,
} from "./catalog-from-config"

describe("parseGrokModelCatalogFromConfigToml", () => {
  test("detects CLI proxy base URL and collects available + model section ids", () => {
    // Given: a 9router-style proxy base URL plus multi-provider model aliases.
    const toml = `
[endpoints]
models_base_url = "http://127.0.0.1:20128/v1"

[omo.models]
default = "openai/gpt-5.5"
available = [
    "openai/gpt-5.5",
    "anthropic/claude-opus-4-7",
    "grok-4.5",
]

[model."openai/gpt-5.5"]
model = "openai/gpt-5.5"
base_url = "http://127.0.0.1:20128/v1"

[model.grok-4.5]
model = "grok-4.5"
`

    // When: the host-side catalog is parsed from config.toml.
    const parsed = parseGrokModelCatalogFromConfigToml(toml)

    // Then: proxy is detected and OMO providers appear in the model-core catalog.
    expect(parsed.hasCliProxy).toBe(true)
    expect(parsed.modelsBaseUrl).toBe("http://127.0.0.1:20128/v1")
    expect(parsed.modelIds).toEqual(
      expect.arrayContaining(["openai/gpt-5.5", "anthropic/claude-opus-4-7", "grok-4.5"]),
    )
    expect(parsed.catalog.availableModels.has("openai/gpt-5.5")).toBe(true)
    expect(parsed.catalog.availableModels.has("anthropic/claude-opus-4-7")).toBe(true)
    expect(parsed.catalog.availableModels.has("xai/grok-4.5")).toBe(true)
    expect(parsed.catalog.connectedProviders).toEqual(
      expect.arrayContaining(["openai", "anthropic", "xai"]),
    )
  })

  test("detects omo.providers multi-endpoint proxy without models_base_url", () => {
    const toml = `
[omo.providers.nine]
base_url = "http://127.0.0.1:20128/v1"
env_key = "NINEROUTER_KEY"

[omo.providers.acme]
base_url = "https://models.example.test/v1"
`

    const parsed = parseGrokModelCatalogFromConfigToml(toml)
    expect(parsed.hasCliProxy).toBe(true)
    expect(parsed.modelsBaseUrl).toBeNull()
    expect(parsed.providerIds).toEqual(["nine", "acme"])
    expect(parsed.catalog.connectedProviders).toEqual(expect.arrayContaining(["acme", "nine", "xai"]))
  })

  test("vanilla host with only Grok models is not a multi-provider CLI proxy", () => {
    const toml = `
[models]
default = "grok-4.5"

[omo.models]
available = ["grok-4.5", "grok-composer-2.5-fast"]

[model."grok-4.5"]
model = "grok-4.5"
`
    const parsed = parseGrokModelCatalogFromConfigToml(toml)
    expect(parsed.hasCliProxy).toBe(false)
    expect(catalogLooksLikeCliProxy(parsed.modelIds)).toBe(false)
    expect(parsed.catalog.connectedProviders).toEqual(["xai"])
  })
})

describe("catalogLooksLikeCliProxy", () => {
  test("true for bare multi-provider ids and provider-qualified non-xai ids", () => {
    expect(catalogLooksLikeCliProxy(["gpt-5.5", "grok-4.5"])).toBe(true)
    expect(catalogLooksLikeCliProxy(["openai/gpt-5.5"])).toBe(true)
    expect(catalogLooksLikeCliProxy(["claude-opus-4-7"])).toBe(true)
    expect(catalogLooksLikeCliProxy(["grok-4.5", "grok-3-mini-fast"])).toBe(false)
  })
})

describe("readGrokModelCatalogFromHome", () => {
  test("reads the shipped config.toml path under home", async () => {
    const home = join(tmpdir(), `lfg-catalog-config-${Date.now()}`)
    await mkdir(join(home, ".grok"), { recursive: true })
    await writeFile(
      join(home, ".grok", "config.toml"),
      `[endpoints]\nmodels_base_url = "http://127.0.0.1:20128/v1"\n\n[omo.models]\navailable = ["openai/gpt-5.5"]\n`,
      "utf8",
    )

    const parsed = await readGrokModelCatalogFromHome(home)
    expect(parsed?.hasCliProxy).toBe(true)
    expect(parsed?.catalog.availableModels.has("openai/gpt-5.5")).toBe(true)
  })
})
