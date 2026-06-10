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
    const explorer = await readFile(join(home, ".grok", "agents", "explorer.toml"), "utf8")
    expect(explorer).toContain('model = "gpt-4.1-mini"')
    expect(explorer).toContain("reasoning_effort")
    expect(explorer).not.toContain("model_reasoning_effort")
    expect(run.agentOverridesPath).toContain("lazycodex-agent-overrides.json")
  })
})