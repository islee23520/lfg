import { mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { runGrokInstall } from "./run-grok-install"

/** #30 — agent TOMLs written on install with model + reasoning fields. */
describe("agent tomls acceptance (#30)", () => {
  test("runGrokInstall writes explorer reasoning coding with single model keys", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-agent-accept-"))
    const discovery = {
      baseUrl: "http://127.0.0.1:11434/v1",
      modelsUrl: "http://127.0.0.1:11434/v1/models",
      modelIds: ["gpt-4.1-mini", "o3-mini"],
      mapping: { default: "gpt-4.1-mini", fast: "gpt-4.1-mini", reasoning: "o3-mini", coding: "gpt-4.1-mini" },
    }
    const run = await runGrokInstall(discovery, { HOME: home, OPENAI_API_KEY: "sk-test" })
    expect(run.ok).toBe(true)
    expect(run.agentTomls?.written).toHaveLength(3)
    const reasoning = await readFile(join(home, ".grok", "agents", "reasoning.toml"), "utf8")
    expect(reasoning).toContain('model = "o3-mini"')
    expect(reasoning).toContain("model_reasoning_effort")
    expect(reasoning.match(/^model =/gm)?.length).toBe(1)
    const coding = await readFile(join(home, ".grok", "agents", "coding.toml"), "utf8")
    expect(coding).toContain('model = "gpt-4.1-mini"')
  })
})