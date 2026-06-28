import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { defaultLazycodexAgentConfig, type ModelDiscovery } from "../../cli/models/lfg-models"
import { readLazycodexAgentOverridesFile, resolveLazycodexAgentOverrides } from "../agents/lazycodex-agent-overrides"
import { ensureLfgConfigFiles, lfgConfigPath, lfgRuntimeConfigPath, readLfgConfigFile } from "./lfg-config"

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
    expect(result.runtimeConfigPath).toBe(join(home, ".grok", "lfg.json"))
    await expect(readFile(result.schemaPath, "utf8")).resolves.toContain("reasoning_level")
    await expect(readFile(result.runtimeConfigPath, "utf8")).resolves.toContain('"agents"')
    const config = await readLfgConfigFile(home)
    expect(config?.agents?.explorer?.model).toBe("gpt-5.4-mini")
  })

  test("writes selected coding tool adapter into lfg-owned config files", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-config-adapter-home-"))
    await ensureLfgConfigFiles(home, { explorer: { model: "gpt-5.4-mini", reasoningLevel: "low" } }, "pi-agent")

    const config = await readLfgConfigFile(home)
    expect(config?.coding_tool_adapter).toBe("pi-agent")

    const runtimeRaw = await readFile(lfgRuntimeConfigPath(home), "utf8")
    const runtimeConfig = JSON.parse(runtimeRaw) as { readonly coding_tool_adapter?: string }
    expect(runtimeConfig.coding_tool_adapter).toBe("pi-agent")
  })

  test("default jsonc config accepts and applies fallback route fields", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-config-fallback-home-"))
    await ensureLfgConfigFiles(home, {
      explorer: {
        model: "gpt-5.4-mini-fast",
        reasoningLevel: "low",
        serviceTier: "fast",
        modelFallback: "grok-3-mini-fast",
        modelFallbackReasoningLevel: "low",
        modelFallbackServiceTier: "default",
      },
    })

    const config = await readLfgConfigFile(home)
    expect(config?.agents?.explorer).toMatchObject({
      model: "gpt-5.4-mini-fast",
      reasoning_level: "low",
      service_tier: "fast",
      model_fallback: "grok-3-mini-fast",
      model_fallback_reasoning_effort: "low",
      model_fallback_service_tier: "default",
    })

    const resolved = await resolveLazycodexAgentOverrides(home, defaultLazycodexAgentConfig(discovery))
    expect(resolved.explorer).toMatchObject({
      model: "gpt-5.4-mini-fast",
      reasoningLevel: "low",
      serviceTier: "fast",
      modelFallback: "grok-3-mini-fast",
      modelFallbackReasoningLevel: "low",
      modelFallbackServiceTier: "default",
    })
  })

  test("writes opencode-shaped lfg.json with provider-prefixed models and fallback_models", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-runtime-config-home-"))
    await ensureLfgConfigFiles(home, {
      explorer: {
        model: "gpt-5.4-mini",
        reasoningLevel: "low",
        modelFallback: "grok-3-mini-fast",
        modelFallbackReasoningLevel: "low",
      },
      ultrabrain: {
        model: "gpt-5.5",
        reasoningLevel: "xhigh",
        modelFallback: "grok-4.20-0309-reasoning",
        modelFallbackReasoningLevel: "high",
      },
    })

    const raw = await readFile(lfgRuntimeConfigPath(home), "utf8")
    const parsed = JSON.parse(raw) as {
      readonly agents: Record<string, { readonly model: string; readonly variant?: string; readonly fallback_models?: readonly { readonly model: string; readonly variant?: string }[] }>
      readonly categories: Record<string, { readonly model: string; readonly variant?: string; readonly fallback_models?: readonly { readonly model: string; readonly variant?: string }[] }>
      readonly runtime_fallback?: { readonly enabled?: boolean }
    }
    expect(parsed.agents.explorer).toMatchObject({
      model: "cliproxy/gpt-5.4-mini",
      variant: "low",
      fallback_models: [{ model: "cliproxy/grok-3-mini-fast", variant: "low" }],
    })
    expect(parsed.categories.ultrabrain).toMatchObject({
      model: "cliproxy/gpt-5.5",
      variant: "xhigh",
      fallback_models: [{ model: "cliproxy/grok-4.20-0309-reasoning", variant: "high" }],
    })
    expect(parsed.runtime_fallback?.enabled).toBe(true)
  })

  test("loads lfg.json before legacy overrides and strips provider prefixes for Grok roles", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-runtime-config-read-"))
    await ensureLfgConfigFiles(home, {})
    await writeFile(
      lfgRuntimeConfigPath(home),
      JSON.stringify({
        version: 1,
        agents: {
          explorer: {
            model: "cliproxy/grok-3-mini-fast",
            variant: "low",
            fallback_models: [{ model: "cliproxy/gpt-5.5", variant: "high" }],
          },
        },
      }),
      "utf8",
    )

    const resolved = await resolveLazycodexAgentOverrides(home, defaultLazycodexAgentConfig(discovery))
    expect(resolved.explorer).toMatchObject({
      model: "grok-3-mini-fast",
      reasoningLevel: "low",
      modelFallback: "gpt-5.5",
      modelFallbackReasoningLevel: "high",
    })
  })

  test("accepts extra opencode route fields in lfg.json and applies the model route only", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-runtime-config-extra-"))
    await ensureLfgConfigFiles(home, {})
    await writeFile(
      lfgRuntimeConfigPath(home),
      JSON.stringify({
        version: 1,
        agents: {
          explorer: {
            model: "cliproxy/grok-3-mini-fast",
            variant: "low",
            temperature: 0.1,
            tools: { glob: true },
            prompt_append: "ignored by Grok mapping",
          },
        },
        model_capabilities: { "cliproxy/grok-3-mini-fast": { text: true } },
      }),
      "utf8",
    )

    const resolved = await resolveLazycodexAgentOverrides(home, defaultLazycodexAgentConfig(discovery))
    expect(resolved.explorer).toMatchObject({ model: "grok-3-mini-fast", reasoningLevel: "low" })
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
    expect(resolved.explorer).toMatchObject({ model: "user-fast", reasoningLevel: "medium" })
    await expect(readLazycodexAgentOverridesFile(home)).resolves.toEqual({})
  })
})
