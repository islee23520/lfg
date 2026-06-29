import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { writeGrokModelConfig } from "./lfg-grok-config"
import type { ModelDiscovery } from "../models/lfg-models"

const discovery: ModelDiscovery = {
  baseUrl: "http://127.0.0.1:11434/v1",
  modelsUrl: "http://127.0.0.1:11434/v1/models",
  modelIds: ["gpt-4.1-mini"],
  mapping: { default: "gpt-4.1-mini", fast: "gpt-4.1-mini", reasoning: "gpt-4.1-mini", coding: "gpt-4.1-mini" },
}

describe("grok config endpoints (#24)", () => {
  test("writeGrokModelConfig never sets endpoints.api_key", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-endpoints-"))
    const path = join(home, ".grok", "config.toml")
    await mkdir(join(home, ".grok"), { recursive: true })
    await writeFile(path, '[endpoints]\napi_key = "legacy"\n', "utf8")
    await writeGrokModelConfig(discovery, { home, apiKey: "sk-test" })
    const config = await readFile(path, "utf8")
    const endpointsBlock = config.split(/\n\[/).find((chunk) => chunk.startsWith("endpoints]") || chunk.startsWith("[endpoints]"))
    expect(endpointsBlock ?? config).not.toMatch(/\[endpoints\][\s\S]*api_key/)
    expect(config).toContain('api_key = "sk-test"')
    expect(config).toContain("[model.")
  })

  test("strips endpoints.api_key without echoing secret in endpoints block (#24)", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-endpoints-strip-"))
    const path = join(home, ".grok", "config.toml")
    await mkdir(join(home, ".grok"), { recursive: true })
    await writeFile(path, '[endpoints]\nmodels_base_url = "http://127.0.0.1:11434/v1"\napi_key = "04d40610eb7cf693"\n', "utf8")
    await writeGrokModelConfig(discovery, { home, apiKey: "sk-redacted-test" })
    const config = await readFile(path, "utf8")
    const endpointsOnly = config.split(/\n\[/).find((c) => c.startsWith("[endpoints]") || c.startsWith("endpoints]")) ?? ""
    expect(endpointsOnly).not.toContain("api_key")
    expect(endpointsOnly).toContain("models_base_url")
  })

  test("multi-provider preset writes provider-specific model base URLs", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-multi-provider-config-"))
    const multi: ModelDiscovery = {
      ...discovery,
      modelIds: ["grok-4.3", "gpt-5.5", "glm-5.2"],
      mapping: { default: "grok-4.3", fast: "grok-4.3", reasoning: "gpt-5.5", coding: "gpt-5.5" },
      providerEndpoints: [
        { id: "xai", baseUrl: "https://api.x.ai/v1", modelIds: ["grok-4.3"] },
        { id: "openai-compatible", baseUrl: "http://127.0.0.1:8317/v1", modelIds: ["gpt-5.5"] },
        { id: "glm", baseUrl: "https://open.bigmodel.cn/api/paas/v4", modelIds: ["glm-5.2"] },
      ],
    }

    await writeGrokModelConfig(multi, { home })

    const config = await readFile(join(home, ".grok", "config.toml"), "utf8")
    expect(section(config, 'model."grok-4.3"')).toContain('base_url = "https://api.x.ai/v1"')
    expect(section(config, 'model."gpt-5.5"')).toContain('base_url = "http://127.0.0.1:8317/v1"')
    expect(section(config, 'model."glm-5.2"')).toContain('base_url = "https://open.bigmodel.cn/api/paas/v4"')
    expect(section(config, "endpoints")).toContain('models_base_url = "http://127.0.0.1:11434/v1"')
  })

  test("does not copy one global api key into provider-specific model sections", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-multi-provider-auth-"))
    const multi: ModelDiscovery = {
      ...discovery,
      modelIds: ["grok-4.3", "gpt-5.5", "glm-5.2"],
      mapping: { default: "grok-4.3", fast: "grok-4.3", reasoning: "gpt-5.5", coding: "gpt-5.5" },
      providerEndpoints: [
        { id: "xai", baseUrl: "https://api.x.ai/v1", modelIds: ["grok-4.3"] },
        { id: "openai-compatible", baseUrl: "http://127.0.0.1:8317/v1", modelIds: ["gpt-5.5"] },
        { id: "glm", baseUrl: "https://open.bigmodel.cn/api/paas/v4", modelIds: ["glm-5.2"] },
      ],
    }

    await writeGrokModelConfig(multi, { home, apiKey: "sk-test" })

    const config = await readFile(join(home, ".grok", "config.toml"), "utf8")
    expect(section(config, 'model."grok-4.3"')).not.toContain("api_key")
    expect(section(config, 'model."gpt-5.5"')).not.toContain("api_key")
    expect(section(config, 'model."glm-5.2"')).not.toContain("api_key")
  })

  test("does not write a global api key to fallback-base provider sections", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-fallback-provider-auth-"))
    const multi: ModelDiscovery = {
      ...discovery,
      modelIds: ["grok-4.3", "custom-openai-model"],
      mapping: { default: "custom-openai-model", fast: "custom-openai-model", reasoning: "grok-4.3", coding: "custom-openai-model" },
      providerEndpoints: [
        { id: "xai", baseUrl: "https://api.x.ai/v1", modelIds: ["grok-4.3"] },
        { id: "openai-compatible", baseUrl: discovery.baseUrl, modelIds: ["custom-openai-model"] },
      ],
    }

    await writeGrokModelConfig(multi, { home, apiKey: "sk-test" })

    const config = await readFile(join(home, ".grok", "config.toml"), "utf8")
    expect(section(config, 'model."grok-4.3"')).not.toContain("api_key")
    expect(section(config, 'model."custom-openai-model"')).not.toContain("api_key")
    expect(section(config, 'model."grok-build"')).not.toContain("api_key")
  })

  test("writes discovered reasoning effort into model sections", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-reasoning-effort-config-"))
    const withReasoningEffort: ModelDiscovery = {
      ...discovery,
      modelIds: ["gpt-5.5"],
      mapping: { default: "gpt-5.5", fast: "gpt-5.5", reasoning: "gpt-5.5", coding: "gpt-5.5" },
      modelFeatureMetadata: {
        "gpt-5.5": { reasoningEffort: "xhigh" },
      },
    }

    await writeGrokModelConfig(withReasoningEffort, { home })

    const config = await readFile(join(home, ".grok", "config.toml"), "utf8")
    expect(section(config, 'model."gpt-5.5"')).toContain('reasoning_effort = "xhigh"')
    expect(section(config, 'model."grok-build"')).toContain('reasoning_effort = "xhigh"')
  })

  test("host-auth-only mode removes proxy endpoints and model base URLs", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-host-auth-only-config-"))
    const path = join(home, ".grok", "config.toml")
    await mkdir(join(home, ".grok"), { recursive: true })
    await writeFile(
      path,
      [
        "[endpoints]",
        'models_base_url = "http://127.0.0.1:8317/v1"',
        'api_key = "legacy-secret"',
        "",
        '[model."grok-build"]',
        'model = "gpt-5.5"',
        'base_url = "http://127.0.0.1:8317/v1"',
        'api_key = "legacy-model-secret"',
        "",
        '[model."gpt-5.5"]',
        'model = "gpt-5.5"',
        'base_url = "http://127.0.0.1:8317/v1"',
      ].join("\n"),
      "utf8",
    )
    const vanillaGrok: ModelDiscovery = {
      baseUrl: "",
      modelsUrl: "",
      modelIds: ["grok-build", "grok-3-mini-fast"],
      mapping: {
        default: "grok-build",
        fast: "grok-3-mini-fast",
        reasoning: "grok-build",
        coding: "grok-build",
      },
    }

    await writeGrokModelConfig(vanillaGrok, { home, apiKey: "sk-test", hostAuthOnly: true })

    const config = await readFile(path, "utf8")
    expect(section(config, "endpoints")).not.toContain("models_base_url")
    expect(section(config, "endpoints")).not.toContain("api_key")
    expect(section(config, 'model."grok-build"')).toContain('model = "grok-build"')
    expect(section(config, 'model."grok-build"')).not.toContain("base_url")
    expect(section(config, 'model."grok-build"')).not.toContain("api_key")
    expect(section(config, 'model."gpt-5.5"')).toBe("")
    expect(config).not.toContain('base_url = "http://127.0.0.1:8317/v1"')
  })
})

function section(source: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(`\\[${escaped}\\]\\n[\\s\\S]*?(?=\\n\\[[^\\n]+\\]|$)`).exec(source)?.[0] ?? ""
}
