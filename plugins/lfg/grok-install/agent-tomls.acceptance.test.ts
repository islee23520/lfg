import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
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
    expect(run.lazycodexAgents?.written.length).toBeGreaterThanOrEqual(1)
    const reasoning = await readFile(join(home, ".grok", "roles", "reasoning.toml"), "utf8")
    expect(reasoning).toContain('model = "o3-mini"')
    expect(reasoning).toContain("reasoning_effort")
    expect(reasoning.match(/^model =/gm)?.length).toBe(1)
    const coding = await readFile(join(home, ".grok", "roles", "coding.toml"), "utf8")
    expect(coding).toContain('model = "gpt-4.1-mini"')
    const codingAgent = await readFile(join(home, ".grok", "plugins", "lfg", "agents", "coding.md"), "utf8")
    expect(codingAgent).toContain("name: coding")
  })

  test("null discovery materializes agents from existing config.toml", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-agent-from-config-"))
    const grokDir = join(home, ".grok")
    await mkdir(grokDir, { recursive: true })
    await writeFile(
      join(grokDir, "config.toml"),
      `[lazycodex.agents.explorer]
model = "ledger-explorer"
reasoning_level = "low"

[lazycodex.agents.reasoning]
model = "ledger-reason"
reasoning_level = "high"

[lazycodex.agents.coding]
model = "ledger-code"
reasoning_level = "medium"
`,
      "utf8",
    )
    const run = await runGrokInstall(null, { HOME: home })
    expect(run.ok).toBe(true)
    const explorer = await readFile(join(home, ".grok", "roles", "explorer.toml"), "utf8")
    expect(explorer).toContain('model = "ledger-explorer"')
  })


})