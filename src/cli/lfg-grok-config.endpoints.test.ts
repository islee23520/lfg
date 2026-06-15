import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { writeGrokModelConfig } from "./lfg-grok-config"
import type { ModelDiscovery } from "./lfg-models"

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
})