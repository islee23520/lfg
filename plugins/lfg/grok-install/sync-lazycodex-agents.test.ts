import { mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { defaultLazycodexAgentConfig, type ModelDiscovery } from "../bin/lfg-models"
import { runGrokInstall } from "./run-grok-install"

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
  test("runGrokInstall writes grok-compatible explorer from fixture ultrawork tree", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-sync-agents-"))
    const run = await runGrokInstall(discovery, { HOME: home, OPENAI_API_KEY: "sk-test" })
    expect(run.ok).toBe(true)
    expect(run.lazycodexAgents?.written.length).toBeGreaterThanOrEqual(1)
    const explorerAgent = await readFile(join(home, ".grok", "installed-plugins", "lfg", "agents", "explorer.md"), "utf8")
    expect(explorerAgent).toContain("name: explorer")
    expect(explorerAgent).toContain("model: gpt-4.1-mini")
    const explorerRole = await readFile(join(home, ".grok", "roles", "explorer.toml"), "utf8")
    expect(explorerRole).toContain('model = "gpt-4.1-mini"')
    expect(explorerRole).toContain("reasoning_effort")
    expect(explorerRole).not.toContain("model_reasoning_effort")
    expect(run.agentOverridesPath).toContain("lazycodex-agent-overrides.json")
    const pluginPackage = await readFile(join(home, ".grok", "installed-plugins", "lfg", "package.json"), "utf8")
    expect(JSON.parse(pluginPackage)).toMatchObject({ name: "LFG" })
    const defaultAgent = await readFile(join(home, ".grok", "agents", "general-purpose.md"), "utf8")
    expect(defaultAgent).toContain("name: general-purpose")
    expect(defaultAgent).toContain("model: gpt-4.1-mini")
    const exploreShadow = await readFile(join(home, ".grok", "agents", "explore.md"), "utf8")
    expect(exploreShadow).toContain("name: explore")
    expect(exploreShadow).toContain("Read-only")
    const ulw = await readFile(join(home, ".grok", "agents", "ulw.md"), "utf8")
    expect(ulw).toContain("name: ulw")
    expect(ulw).toContain("Sisyphus")
    const builder = await readFile(join(home, ".grok", "agents", "grok-build.md"), "utf8")
    expect(builder).toContain("name: grok-build")
  })
})