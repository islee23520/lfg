import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { defaultLazycodexAgentConfig, type ModelDiscovery } from "../bin/lfg-models"
import { readLazycodexAgentOverridesFile, resolveLazycodexAgentOverrides } from "./lazycodex-agent-overrides"
import { ensureLfgConfigFiles, lfgConfigPath, readLfgConfigFile } from "./lfg-config"

const discovery: ModelDiscovery = {
  baseUrl: "http://127.0.0.1/v1",
  modelsUrl: "http://127.0.0.1/v1/models",
  modelIds: ["gpt-4.1-mini", "o3-mini"],
  mapping: { default: "gpt-4.1-mini", fast: "gpt-4.1-mini", reasoning: "o3-mini", coding: "gpt-4.1-mini" },
}

describe("lfg-config", () => {
  test("writes default jsonc config and schema under global grok home", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-config-home-"))
    const result = await ensureLfgConfigFiles(home, { explorer: { model: "gpt-5.4-mini", reasoningLevel: "low" } })

    expect(result.configPath).toBe(join(home, ".grok", "lfg-config.jsonc"))
    expect(result.schemaPath).toBe(join(home, ".grok", "lfg-config.schema.json"))
    await expect(readFile(result.schemaPath, "utf8")).resolves.toContain("reasoning_level")
    const config = await readLfgConfigFile(home)
    expect(config?.agents?.explorer?.model).toBe("gpt-5.4-mini")
  })

  test("loads jsonc agent overrides before syncing agent surfaces", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-config-override-"))
    await ensureLfgConfigFiles(home, {})
    await writeFile(
      lfgConfigPath(home),
      '{\n  // user-tuned runtime agent route\n  "version": 1,\n  "agents": { "explorer": { "model": "user-fast", "reasoning_level": "medium" } }\n}\n',
      "utf8",
    )

    const resolved = await resolveLazycodexAgentOverrides(home, defaultLazycodexAgentConfig(discovery))
    expect(resolved.explorer).toEqual({ model: "user-fast", reasoningLevel: "medium" })
    await expect(readLazycodexAgentOverridesFile(home)).resolves.toEqual({})
  })
})
