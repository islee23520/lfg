import { mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { runGrokInstall } from "./run-grok-install"

describe("runGrokInstall default agent surfaces", () => {
  test("null discovery writes default, prometheus, sisyphus, and atlas overrides and plugin-owned agent surfaces", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-grok-default-prometheus-null-"))
    const run = await runGrokInstall(null, { HOME: home })
    expect(run.ok).toBe(true)

    const overridesRaw = await readFile(join(home, ".grok", "omo-agent-overrides.json"), "utf8")
    expect(overridesRaw).toContain('"default"')
    expect(overridesRaw).toContain('"prometheus"')
    expect(overridesRaw).toContain('"sisyphus"')
    expect(overridesRaw).toContain('"atlas"')
    const lfgRuntimeRaw = await readFile(join(home, ".grok", "lfg.json"), "utf8")
    const lfgRuntime = JSON.parse(lfgRuntimeRaw) as {
      readonly agents?: Record<string, { readonly model?: string; readonly variant?: string }>
      readonly runtime_fallback?: { readonly enabled?: boolean }
    }
    expect(lfgRuntime.agents?.default).toMatchObject({ model: "cliproxy/gpt-5.5", variant: "high" })
    expect(lfgRuntime.agents?.sisyphus).toMatchObject({ model: "cliproxy/gpt-5.5", variant: "medium" })
    expect(lfgRuntime.runtime_fallback?.enabled).toBe(true)

    const defaultRole = await readFile(join(home, ".grok", "roles", "default.toml"), "utf8")
    expect(defaultRole).toContain('model = "gpt-5.5"')
    expect(defaultRole).toContain('reasoning_effort = "high"')

    const prometheusRole = await readFile(join(home, ".grok", "roles", "prometheus.toml"), "utf8")
    expect(prometheusRole).toContain('model = "gpt-5.5"')
    expect(prometheusRole).toContain('reasoning_effort = "xhigh"')

    const sisyphusRole = await readFile(join(home, ".grok", "roles", "sisyphus.toml"), "utf8")
    expect(sisyphusRole).toContain('model = "gpt-5.5"')
    expect(sisyphusRole).toContain('reasoning_effort = "medium"')

    const atlasRole = await readFile(join(home, ".grok", "roles", "atlas.toml"), "utf8")
    expect(atlasRole).toContain('model = "claude-sonnet-4-6"')
    expect(atlasRole).toContain('reasoning_effort = "high"')

    const defaultAgent = await readFile(join(home, ".grok", "plugins", "lfg", "agents", "default.md"), "utf8")
    expect(defaultAgent).toContain("name: default")

    const prometheusPluginAgent = await readFile(join(home, ".grok", "plugins", "lfg", "agents", "prometheus.md"), "utf8")
    expect(prometheusPluginAgent).toContain("name: prometheus")

    const sisyphusPluginAgent = await readFile(join(home, ".grok", "plugins", "lfg", "agents", "sisyphus.md"), "utf8")
    expect(sisyphusPluginAgent).toContain("name: sisyphus")
    expect(sisyphusPluginAgent).toContain("Source: lfg-owned fallback prompt")
    expect(sisyphusPluginAgent).not.toContain("sisyphus.toml")

    const atlasPluginAgent = await readFile(join(home, ".grok", "plugins", "lfg", "agents", "atlas.md"), "utf8")
    expect(atlasPluginAgent).toContain("name: atlas")
    expect(atlasPluginAgent).toContain("Source: lfg-owned fallback prompt")
    expect(atlasPluginAgent).not.toContain("atlas.toml")

    await expect(readFile(join(home, ".grok", "prompts", "omo", "default.md"), "utf8")).resolves.toContain("OMO Sisyphus")
    await expect(readFile(join(home, ".grok", "prompts", "omo", "prometheus.md"), "utf8")).resolves.toContain("OMO Prometheus")
    await expect(readFile(join(home, ".grok", "prompts", "omo", "sisyphus.md"), "utf8")).resolves.toContain("OMO Sisyphus")
    await expect(readFile(join(home, ".grok", "prompts", "omo", "atlas.md"), "utf8")).resolves.toContain("OMO Atlas")
  })

  test("null discovery writes oracle and sisyphus-junior as distinct agent surfaces", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-grok-oracle-junior-"))
    const run = await runGrokInstall(null, { HOME: home })
    expect(run.ok).toBe(true)

    const oracleRole = await readFile(join(home, ".grok", "roles", "oracle.toml"), "utf8")
    expect(oracleRole).toContain('model = "gpt-5.5"')
    expect(oracleRole).toContain('reasoning_effort = "high"')

    const atlasRole = await readFile(join(home, ".grok", "roles", "atlas.toml"), "utf8")
    expect(atlasRole).toContain('model = "claude-sonnet-4-6"')

    const oraclePrompt = await readFile(join(home, ".grok", "prompts", "omo", "oracle.md"), "utf8")
    expect(oraclePrompt).toContain("OMO Oracle")
    expect(oraclePrompt).not.toContain("OMO Atlas")

    const atlasPrompt = await readFile(join(home, ".grok", "prompts", "omo", "atlas.md"), "utf8")
    expect(atlasPrompt).toContain("OMO Atlas")
    expect(atlasPrompt).not.toContain("OMO Oracle")

    const oracleAgent = await readFile(join(home, ".grok", "plugins", "lfg", "agents", "oracle.md"), "utf8")
    expect(oracleAgent).toContain("name: oracle")
    const atlasAgent = await readFile(join(home, ".grok", "plugins", "lfg", "agents", "atlas.md"), "utf8")
    expect(atlasAgent).toContain("name: atlas")

    const juniorRole = await readFile(join(home, ".grok", "roles", "sisyphus-junior.toml"), "utf8")
    expect(juniorRole).toContain('model = "claude-sonnet-4-6"')
    expect(juniorRole).toContain('reasoning_effort = "medium"')

    const juniorPrompt = await readFile(join(home, ".grok", "prompts", "omo", "sisyphus-junior.md"), "utf8")
    expect(juniorPrompt).toContain("OMO Sisyphus-Junior")

    const juniorAgent = await readFile(join(home, ".grok", "plugins", "lfg", "agents", "sisyphus-junior.md"), "utf8")
    expect(juniorAgent).toContain("name: sisyphus-junior")

    const overridesRaw = await readFile(join(home, ".grok", "omo-agent-overrides.json"), "utf8")
    expect(overridesRaw).toContain('"oracle"')
    expect(overridesRaw).toContain('"sisyphus-junior"')
  })

  test("null discovery writes OMO category agents", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-grok-categories-"))
    const run = await runGrokInstall(null, { HOME: home })
    expect(run.ok).toBe(true)

    for (const name of ["ultrabrain", "deep", "quick", "unspecified-low", "unspecified-high", "writing"]) {
      const role = await readFile(join(home, ".grok", "roles", `${name}.toml`), "utf8")
      expect(role).toContain("model =")
      expect(role).toContain("reasoning_effort")
    }

    const ultrabrainRole = await readFile(join(home, ".grok", "roles", "ultrabrain.toml"), "utf8")
    expect(ultrabrainRole).toContain('model = "gpt-5.5"')
    expect(ultrabrainRole).toContain('reasoning_effort = "xhigh"')

    const quickRole = await readFile(join(home, ".grok", "roles", "quick.toml"), "utf8")
    expect(quickRole).toContain('model = "gpt-5.4-mini"')

    const overridesRaw = await readFile(join(home, ".grok", "omo-agent-overrides.json"), "utf8")
    expect(overridesRaw).toContain('"ultrabrain"')
    expect(overridesRaw).toContain('"deep"')
    expect(overridesRaw).toContain('"quick"')
    expect(overridesRaw).toContain('"unspecified-low"')
    expect(overridesRaw).toContain('"unspecified-high"')
    expect(overridesRaw).toContain('"writing"')
  })
})
