import { mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import type { ModelDiscovery } from "../bin/lfg-models"
import { runGrokInstall } from "./run-grok-install"

describe("runGrokInstall", () => {
  test("config.toml merge is stable across two runs with same discovery", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-idem-home-"))
    const discovery: ModelDiscovery = {
      baseUrl: "http://127.0.0.1:11434/v1",
      modelsUrl: "http://127.0.0.1:11434/v1/models",
      modelIds: ["gpt-4.1-mini", "o3-mini"],
      mapping: { default: "gpt-4.1-mini", fast: "gpt-4.1-mini", reasoning: "o3-mini", coding: "gpt-4.1-mini" },
    }
    const env = { HOME: home, OPENAI_API_KEY: "sk-test-key" }
    await runGrokInstall(discovery, env)
    const first = await readFile(join(home, ".grok", "config.toml"), "utf8")
    await runGrokInstall(discovery, env)
    const second = await readFile(join(home, ".grok", "config.toml"), "utf8")
    expect(second).toBe(first)
    expect(first).toContain("[endpoints]")
    expect(first).toContain('default = "gpt-4.1-mini"')
  })

  test("null discovery skips config merge but still installs plugin (#29)", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-grok-null-disc-"))
    const env = { HOME: home }
    const run = await runGrokInstall(null, env)
    expect(run.ok).toBe(true)
    expect(run.configUpdate).toBeNull()
    expect(run.agentTomls).toBeNull()
    const stamp = await readFile(join(home, ".grok", "installed-plugins", "lazycodex", "lfg-install.json"), "utf8")
    expect(stamp).toContain("@islee23520/lfg")
  })
})