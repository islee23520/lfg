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

  test("null discovery skips config merge but still installs plugin and global agents (#29)", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-grok-null-disc-"))
    const env = { HOME: home }
    const run = await runGrokInstall(null, env)
    expect(run.ok).toBe(true)
    expect(run.configUpdate).toBeNull()
    expect(run.lazycodexAgents?.written.length).toBeGreaterThanOrEqual(1)
    const explorer = await readFile(join(home, ".grok", "agents", "explorer.toml"), "utf8")
    expect(explorer).toContain('model = "grok-build"')
    const stamp = await readFile(join(home, ".grok", "installed-plugins", "lfg", "lfg-install.json"), "utf8")
    expect(stamp).toContain("@islee23520/lfg")
  })

  test("lfg-install.json stamp stable across two runGrokInstall calls (#27)", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-idem-stamp-"))
    const discovery: ModelDiscovery = {
      baseUrl: "http://127.0.0.1:11434/v1",
      modelsUrl: "http://127.0.0.1:11434/v1/models",
      modelIds: ["gpt-4.1-mini"],
      mapping: { default: "gpt-4.1-mini", fast: "gpt-4.1-mini", reasoning: "gpt-4.1-mini", coding: "gpt-4.1-mini" },
    }
    const env = { HOME: home, OPENAI_API_KEY: "sk-test-key" }
    await runGrokInstall(discovery, env)
    const stampPath = join(home, ".grok", "installed-plugins", "lfg", "lfg-install.json")
    const first = await readFile(stampPath, "utf8")
    await runGrokInstall(discovery, env)
    const second = await readFile(stampPath, "utf8")
    expect(second).toBe(first)
    expect(first).toContain('"platform": "grok"')
  })

  test("with discovery writes explorer agent toml (#30)", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-grok-agents-"))
    const discovery: ModelDiscovery = {
      baseUrl: "http://127.0.0.1:11434/v1",
      modelsUrl: "http://127.0.0.1:11434/v1/models",
      modelIds: ["gpt-4.1-mini", "o3-mini"],
      mapping: { default: "gpt-4.1-mini", fast: "gpt-4.1-mini", reasoning: "o3-mini", coding: "gpt-4.1-mini" },
    }
    const run = await runGrokInstall(discovery, { HOME: home, OPENAI_API_KEY: "sk-test" })
    expect(run.ok).toBe(true)
    expect(run.lazycodexAgents?.written.length).toBeGreaterThanOrEqual(1)
    const explorer = await readFile(join(home, ".grok", "agents", "explorer.toml"), "utf8")
    expect(explorer).toContain('model = "gpt-4.1-mini"')
    expect(explorer).toContain("reasoning_effort")
  })
})