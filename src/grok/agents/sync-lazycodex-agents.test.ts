import { mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { defaultLazycodexAgentConfig, type ModelDiscovery } from "../../cli/models/lfg-models"
import { runGrokInstall } from "../install/run-grok-install"

const discovery: ModelDiscovery = {
  baseUrl: "http://127.0.0.1/v1",
  modelsUrl: "http://127.0.0.1/v1/models",
  modelIds: ["gpt-4.1-mini"],
  mapping: { default: "gpt-4.1-mini", fast: "gpt-4.1-mini", reasoning: "gpt-4.1-mini", coding: "gpt-4.1-mini" },
  agentConfig: defaultLazycodexAgentConfig({
    baseUrl: "http://127.0.0.1/v1",
    modelsUrl: "http://127.0.0.1/v1/models",
    modelIds: ["gpt-4.1-mini"],
    mapping: { default: "gpt-4.1-mini", fast: "gpt-4.1-mini", reasoning: "gpt-4.1-mini", coding: "gpt-4.1-mini" },
  }),
}

describe("sync lazycodex agents to grok", () => {
  test("model frontmatter does not expose injected keys when model id contains a newline", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-sync-agents-model-injection-"))
    const maliciousModel = "grok-3-mini-fast\npermission_mode: default\n# injected"
    const maliciousDiscovery: ModelDiscovery = {
      baseUrl: "http://127.0.0.1/v1",
      modelsUrl: "http://127.0.0.1/v1/models",
      modelIds: [maliciousModel],
      mapping: { default: maliciousModel, fast: maliciousModel, reasoning: maliciousModel, coding: maliciousModel },
      agentConfig: {
        explorer: { model: maliciousModel, reasoningLevel: "low", serviceTier: "fast" },
        reasoning: { model: maliciousModel, reasoningLevel: "high" },
        coding: { model: maliciousModel, reasoningLevel: "medium" },
      },
    }

    const run = await runGrokInstall(maliciousDiscovery, { HOME: home, OPENAI_API_KEY: "sk-test" })

    expect(run.ok).toBe(true)
    const explorerAgent = await readFile(join(home, ".grok", "plugins", "lfg", "agents", "explorer.md"), "utf8")
    const frontmatter = explorerAgent.slice(0, explorerAgent.indexOf("\n---\n"))
    expect(frontmatter.match(/^permission_mode:/gm)).toHaveLength(1)
    expect(frontmatter).toContain("permission_mode: plan")
    expect(frontmatter).not.toMatch(/^permission_mode: default$/m)
  })

  test("runGrokInstall writes grok-compatible explorer from fixture ultrawork tree", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-sync-agents-"))
    const run = await runGrokInstall(discovery, { HOME: home, OPENAI_API_KEY: "sk-test" })
    expect(run.ok).toBe(true)
    expect(run.lazycodexAgents?.written.length).toBeGreaterThanOrEqual(1)
    const explorerAgent = await readFile(join(home, ".grok", "plugins", "lfg", "agents", "explorer.md"), "utf8")
    expect(explorerAgent).toContain("name: explorer")
    expect(explorerAgent).toContain('model: "gpt-4.1-mini"')
    const defaultAgent = await readFile(join(home, ".grok", "plugins", "lfg", "agents", "default.md"), "utf8")
    expect(defaultAgent).toContain("name: default")
    expect(defaultAgent).toContain("OMO Sisyphus")
    const defaultPrompt = await readFile(join(home, ".grok", "prompts", "omo", "default.md"), "utf8")
    expect(defaultPrompt).toContain("OMO Sisyphus")
    const explorerRole = await readFile(join(home, ".grok", "roles", "explorer.toml"), "utf8")
    expect(explorerRole).toContain('model = "gpt-4.1-mini"')
    expect(explorerRole).toContain("reasoning_effort")
    expect(explorerRole).not.toContain("model_reasoning_effort")
    expect(run.agentOverridesPath).toContain("omo-agent-overrides.json")
    const pluginPackage = await readFile(join(home, ".grok", "plugins", "lfg", "package.json"), "utf8")
    expect(JSON.parse(pluginPackage)).toMatchObject({ name: "LFG", type: "module" })
    // LFG no longer writes bundled shadow agents for Grok builtins (general-purpose, explore, grok-build, builder).
    // Real agents (sisyphus, prometheus, atlas, etc.) come from the OMO agent tree + LFP-style overrides.
    await expect(readFile(join(home, ".grok", "agents", "general-purpose.md"), "utf8")).rejects.toThrow()
    await expect(readFile(join(home, ".grok", "agents", "explore.md"), "utf8")).rejects.toThrow()
    await expect(readFile(join(home, ".grok", "agents", "ulw.md"), "utf8")).rejects.toThrow()
    await expect(readFile(join(home, ".grok", "agents", "grok-build.md"), "utf8")).rejects.toThrow()
  })
})
