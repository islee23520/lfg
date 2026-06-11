import { cp, lstat, mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"
import type { ModelDiscovery } from "../bin/lfg-models"
import { runGrokInstall } from "./run-grok-install"

const here = dirname(fileURLToPath(import.meta.url))
const fixtureRoot = join(here, "fixture-minimal")

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
    const explorer = await readFile(join(home, ".grok", "roles", "explorer.toml"), "utf8")
    expect(explorer).toContain('model = "gpt-5.4-mini"')
    const explorerAgent = await readFile(join(home, ".grok", "installed-plugins", "lfg", "agents", "explorer.md"), "utf8")
    expect(explorerAgent).toContain("name: explorer")
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

  test("with discovery writes plugin-owned explorer agent and role (#30)", async () => {
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
    const explorer = await readFile(join(home, ".grok", "roles", "explorer.toml"), "utf8")
    expect(explorer).toContain('model = "gpt-4.1-mini"')
    expect(explorer).toContain("reasoning_effort")
    const agent = await readFile(join(home, ".grok", "installed-plugins", "lfg", "agents", "explorer.md"), "utf8")
    expect(agent).toContain("name: explorer")
  })

  test("existing stamped setup preserves install assets while syncing discovered config unless force is explicit", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-grok-existing-"))
    const pluginRoot = join(home, ".grok", "installed-plugins", "lfg")
    const configPath = join(home, ".grok", "config.toml")
    const agentPath = join(home, ".grok", "agents", "explorer.toml")
    await mkdir(join(home, ".grok", "installed-plugins"), { recursive: true })
    await mkdir(join(home, ".grok", "agents"), { recursive: true })
    await cp(fixtureRoot, pluginRoot, { recursive: true })
    await writeFile(join(pluginRoot, "lfg-install.json"), '{"packageName":"@islee23520/lfg","version":"existing"}\n', "utf8")
    await writeFile(configPath, '[lazycodex.models]\ndefault = "user-model"\n', "utf8")
    await writeFile(agentPath, 'model = "user-agent"\n', "utf8")

    const discovery: ModelDiscovery = {
      baseUrl: "http://127.0.0.1:11434/v1",
      modelsUrl: "http://127.0.0.1:11434/v1/models",
      modelIds: ["gpt-5.5"],
      mapping: { default: "gpt-5.5", fast: "gpt-5.5", reasoning: "gpt-5.5", coding: "gpt-5.5" },
    }
    const preserved = await runGrokInstall(discovery, { HOME: home, OPENAI_API_KEY: "sk-test" })

    expect(preserved.internalStep).toMatchObject({ status: "already_installed", skippedExistingSetup: true })
    expect(preserved.configUpdate).toMatchObject({ status: "configured", modelsBaseUrl: discovery.baseUrl })
    expect(preserved.lazycodexAgents).toBeNull()
    const config = await readFile(configPath, "utf8")
    expect(config).toContain('default = "gpt-5.5"')
    expect(config).toContain('"lfg"')
    expect(config).toContain('"lazycodex"')
    expect(config).toContain("[agents]")
    expect(config).toContain('"general-purpose"')
    expect(config).toContain("explorer = true")
    await expect(readFile(agentPath, "utf8")).resolves.toContain('model = "user-agent"')

    const forced = await runGrokInstall(discovery, { HOME: home, OPENAI_API_KEY: "sk-test" }, { force: true })
    expect(forced.internalStep).toMatchObject({ status: "installed" })
    await expect(readFile(configPath, "utf8")).resolves.toContain('default = "gpt-5.5"')
  })

  test("existing stamped setup with no discovery keeps user config unchanged", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-grok-existing-null-"))
    const pluginRoot = join(home, ".grok", "installed-plugins", "lfg")
    const configPath = join(home, ".grok", "config.toml")
    await mkdir(join(home, ".grok", "installed-plugins"), { recursive: true })
    await cp(fixtureRoot, pluginRoot, { recursive: true })
    await writeFile(join(pluginRoot, "lfg-install.json"), '{"packageName":"@islee23520/lfg","version":"existing"}\n', "utf8")
    await writeFile(configPath, '[lazycodex.models]\ndefault = "user-model"\n', "utf8")

    const preserved = await runGrokInstall(null, { HOME: home })

    expect(preserved.internalStep).toMatchObject({ status: "already_installed", skippedExistingSetup: true })
    expect(preserved.configUpdate).toBeNull()
    expect(preserved.lazycodexAgents).toBeNull()
    await expect(readFile(configPath, "utf8")).resolves.toContain('default = "user-model"')
  })

  test("incomplete stamped setup is reinstalled instead of preserved", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-grok-incomplete-"))
    const pluginRoot = join(home, ".grok", "installed-plugins", "lfg")
    await mkdir(pluginRoot, { recursive: true })
    await writeFile(join(pluginRoot, "lfg-install.json"), '{"packageName":"@islee23520/lfg","version":"incomplete"}\n', "utf8")

    const run = await runGrokInstall(null, { HOME: home })

    expect(run.internalStep).toMatchObject({ status: "installed" })
    expect(run.internalStep).not.toMatchObject({ skippedExistingSetup: true })
    await expect(readFile(join(pluginRoot, "hooks", "hooks.json"), "utf8")).resolves.toContain("SessionStart")
  })

  test("symlinked stamped setup is reinstalled as a real directory instead of preserved", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-grok-symlink-"))
    const target = await mkdtemp(join(tmpdir(), "lfg-grok-symlink-target-"))
    const pluginRoot = join(home, ".grok", "installed-plugins", "lfg")
    await mkdir(join(home, ".grok", "installed-plugins"), { recursive: true })
    await cp(fixtureRoot, target, { recursive: true })
    await writeFile(join(target, "lfg-install.json"), '{"packageName":"@islee23520/lfg","version":"symlink"}\n', "utf8")
    await symlink(target, pluginRoot)

    const run = await runGrokInstall(null, { HOME: home })

    const stat = await lstat(pluginRoot)
    expect(run.internalStep).toMatchObject({ status: "installed" })
    expect(run.internalStep).not.toMatchObject({ skippedExistingSetup: true })
    expect(stat.isDirectory()).toBe(true)
    expect(stat.isSymbolicLink()).toBe(false)
  })
})
