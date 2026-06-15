import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { defaultLazycodexAgentConfig } from "../cli/lfg-models"
import type { ModelDiscovery } from "../cli/lfg-models"
import { applyLazycodexAgentTomls } from "./apply-agent-tomls"

const discovery: ModelDiscovery = {
  baseUrl: "http://127.0.0.1/v1",
  modelsUrl: "http://127.0.0.1/v1/models",
  modelIds: ["gpt-4.1-mini", "o3-mini"],
  mapping: { default: "gpt-4.1-mini", fast: "gpt-4.1-mini", reasoning: "o3-mini", coding: "gpt-4.1-mini" },
}

describe("apply-agent-tomls", () => {
  test("second apply preserves user custom key in agent toml", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-agents-preserve-"))
    const agents = defaultLazycodexAgentConfig(discovery)
    await applyLazycodexAgentTomls(home, agents)
    const explorerPath = join(home, ".grok", "agents", "explorer.toml")
    await writeFile(explorerPath, `${await readFile(explorerPath, "utf8")}custom_note = "keep-me"\n`, "utf8")
    await applyLazycodexAgentTomls(home, agents)
    const after = await readFile(explorerPath, "utf8")
    expect(after).toContain('custom_note = "keep-me"')
    expect(after).toContain('model = "gpt-4.1-mini"')
    expect(after.match(/model =/g)?.length).toBe(1)
  })

  test("writes explorer reasoning coding agent files under ~/.grok/agents", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-agents-three-"))
    const result = await applyLazycodexAgentTomls(home, defaultLazycodexAgentConfig(discovery))
    expect(result.written.map((p) => p.split("/").pop())).toEqual(["explorer.toml", "reasoning.toml", "coding.toml"])
  })
})