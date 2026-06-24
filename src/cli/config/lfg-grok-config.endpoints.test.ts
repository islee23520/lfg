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
})

function section(source: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(`\\[${escaped}\\]\\n[\\s\\S]*?(?=\\n\\[[^\\n]+\\]|$)`).exec(source)?.[0] ?? ""
}
