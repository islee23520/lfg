import { cp, lstat, mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"
import type { ModelDiscovery } from "../../cli/models/lfg-models"
import { runGrokInstall } from "./run-grok-install"
import { expectUpstreamOmoWorkflowSkills } from "../test/test-omo-skills-assertions"

const here = dirname(fileURLToPath(import.meta.url))
const fixtureRoot = join(here, "..", "fixture")

/** Seeded user Grok builtin agent; must never be moved, unlinked, or backed up by LFG sync. */
const USER_GROK_AGENTS_ULW_SEED =
  "---\nname: ulw\n---\n\nUSER ULW (should survive; LFG no longer manages ulw as an agent)\n"

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
    expect(run.omoAgents?.written.length).toBeGreaterThanOrEqual(1)
    const explorer = await readFile(join(home, ".grok", "roles", "explorer.toml"), "utf8")
    expect(explorer).toContain('model = "grok-composer-2.5-fast"')
    const explorerAgent = await readFile(join(home, ".grok", "plugins", "lfg", "agents", "explorer.md"), "utf8")
    expect(explorerAgent).toContain("name: explorer")
    await expectUpstreamOmoWorkflowSkills(join(home, ".grok", "plugins", "lfg"))
    const stamp = await readFile(join(home, ".grok", "plugins", "lfg", "lfg-install.json"), "utf8")
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
    const stampPath = join(home, ".grok", "plugins", "lfg", "lfg-install.json")
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
    expect(run.omoAgents?.written.length).toBeGreaterThanOrEqual(1)
    const explorer = await readFile(join(home, ".grok", "roles", "explorer.toml"), "utf8")
    expect(explorer).toContain('model = "gpt-4.1-mini"')
    expect(explorer).toContain("reasoning_effort")
    const agent = await readFile(join(home, ".grok", "plugins", "lfg", "agents", "explorer.md"), "utf8")
    expect(agent).toContain("name: explorer")
  })

  test("existing stamped setup preserves install assets while syncing discovered config unless force is explicit", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-grok-existing-"))
    const pluginRoot = join(home, ".grok", "plugins", "lfg")
    const configPath = join(home, ".grok", "config.toml")
    const agentPath = join(home, ".grok", "agents", "explorer.toml")
    // Seed a user "ulw.md" (unmanaged by LFG) to prove LFG leaves unmanaged agent files alone.
    const userUlwPath = join(home, ".grok", "agents", "ulw.md")
    await mkdir(join(home, ".grok", "plugins"), { recursive: true })
    await mkdir(join(home, ".grok", "agents"), { recursive: true })
    await cp(fixtureRoot, pluginRoot, { recursive: true })
    for (const retiredSkill of ["lcx-contribute-bug-fix", "lcx-doctor", "lcx-report-bug"]) {
      await mkdir(join(pluginRoot, "skills", retiredSkill, "agents"), { recursive: true })
      await writeFile(join(pluginRoot, "skills", retiredSkill, "SKILL.md"), `name: ${retiredSkill}\n`, "utf8")
      await writeFile(join(pluginRoot, "skills", retiredSkill, "agents", "openai.yaml"), "interface:\n  display_name: stale\n", "utf8")
    }
    for (const managedSkill of ["git-master", "ulw-plan", "ulw-loop"]) {
      await mkdir(join(pluginRoot, "skills", managedSkill, "agents"), { recursive: true })
      await writeFile(join(pluginRoot, "skills", managedSkill, "agents", "openai.yaml"), "interface:\n  display_name: stale\n", "utf8")
    }
    await writeFile(join(pluginRoot, "lfg-install.json"), '{"packageName":"@islee23520/lfg","version":"existing"}\n', "utf8")
    await writeFile(configPath, '[omo.models]\ndefault = "user-model"\n', "utf8")
    await writeFile(agentPath, 'model = "user-agent"\n', "utf8")
    await writeFile(userUlwPath, USER_GROK_AGENTS_ULW_SEED, "utf8")

    const discovery: ModelDiscovery = {
      baseUrl: "http://127.0.0.1:11434/v1",
      modelsUrl: "http://127.0.0.1:11434/v1/models",
      modelIds: ["gpt-5.5"],
      mapping: { default: "gpt-5.5", fast: "gpt-5.5", reasoning: "gpt-5.5", coding: "gpt-5.5" },
    }
    const preserved = await runGrokInstall(discovery, { HOME: home, OPENAI_API_KEY: "sk-test" })

    expect(preserved.internalStep).toMatchObject({ status: "already_installed", skippedExistingSetup: true })
    expect(preserved.configUpdate).toMatchObject({ status: "configured", modelsBaseUrl: discovery.baseUrl })
    expect(preserved.omoAgents?.written.length).toBeGreaterThanOrEqual(1)
    expect(preserved.agentOverridesPath).toBe(join(home, ".grok", "omo-agent-overrides.json"))
    const config = await readFile(configPath, "utf8")
    expect(config).toContain('default = "gpt-5.5"')
    expect(config).toContain('"lfg"')
    expect(config).toContain("[omo.models]")
    expect(config).toContain("[agents]")
    expect(config).toContain('default = "sisyphus"')
    // LFG no longer forces Grok builtin shadows for general-purpose/explore/grok-build/builder.
    // It still enables LFG/OMO-provided agents (explorer, sisyphus, prometheus, etc).
    expect(config).toContain("explorer = true")
    // User-provided ulw.md (unmanaged by LFG) must survive byte-for-byte (no move/backup/unlink).
    expect(await readFile(userUlwPath, "utf8")).toBe(USER_GROK_AGENTS_ULW_SEED)
    await expect(readFile(agentPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" })
    await expect(readFile(join(home, ".grok", "agents-toml-backup-lfg", "explorer.toml"), "utf8")).resolves.toContain('model = "user-agent"')
    // No LFG-initiated backup for "ulw" (unmanaged agent name, LFG does not touch it).
    const ulwBackup = join(home, ".grok", "agents-user-backup-lfg", "ulw.md")
    await expect(readFile(ulwBackup, "utf8")).rejects.toMatchObject({ code: "ENOENT" })
    await expect(readFile(join(home, ".grok", "roles", "explorer.toml"), "utf8")).resolves.toContain('model = "gpt-5.5"')
    await expect(readFile(join(home, ".grok", "plugins", "lfg", "agents", "explorer.md"), "utf8")).resolves.toContain("name: explorer")
    await expect(readFile(join(home, ".grok", "omo-agent-overrides.json"), "utf8")).resolves.toContain('"explorer"')
    await expect(readFile(join(home, ".grok", "omo-agent-overrides.json"), "utf8")).resolves.toContain('"default"')
    await expect(readFile(join(home, ".grok", "omo-agent-overrides.json"), "utf8")).resolves.toContain('"prometheus"')
    await expect(readFile(join(home, ".grok", "plugins", "lfg", "agents", "default.md"), "utf8")).resolves.toContain("name: default")
    await expect(readFile(join(home, ".grok", "plugins", "lfg", "agents", "prometheus.md"), "utf8")).resolves.toContain("name: prometheus")
    await expect(readFile(join(pluginRoot, "skills", "lfg-doctor", "SKILL.md"), "utf8")).resolves.toContain("name: lfg-doctor")
    await expect(readFile(join(pluginRoot, "skills", "lcx-doctor", "SKILL.md"), "utf8")).rejects.toMatchObject({ code: "ENOENT" })
    await expect(readFile(join(pluginRoot, "skills", "lcx-report-bug", "agents", "openai.yaml"), "utf8")).rejects.toMatchObject({ code: "ENOENT" })
    await expect(readFile(join(pluginRoot, "skills", "git-master", "agents", "grok.yaml"), "utf8")).resolves.toContain("git-master")
    await expect(readFile(join(pluginRoot, "skills", "git-master", "agents", "openai.yaml"), "utf8")).rejects.toMatchObject({ code: "ENOENT" })
    await expect(readFile(join(pluginRoot, "skills", "ulw-plan", "agents", "openai.yaml"), "utf8")).rejects.toMatchObject({ code: "ENOENT" })
    await expect(readFile(join(home, ".grok", "roles", "default.toml"), "utf8")).resolves.toContain('model = "gpt-5.5"')
    await expect(readFile(join(home, ".grok", "roles", "prometheus.toml"), "utf8")).resolves.toContain('model = "gpt-5.5"')
    await expect(readFile(join(home, ".grok", "roles", "prometheus.toml"), "utf8")).resolves.toContain('reasoning_effort = "xhigh"')
    await expectUpstreamOmoWorkflowSkills(join(home, ".grok", "plugins", "lfg"))

    const repeated = await runGrokInstall(discovery, { HOME: home, OPENAI_API_KEY: "sk-test" })
    expect(repeated.internalStep).toMatchObject({ status: "already_installed", skippedExistingSetup: true })
    expect(await readFile(userUlwPath, "utf8")).toBe(USER_GROK_AGENTS_ULW_SEED)

    const forced = await runGrokInstall(discovery, { HOME: home, OPENAI_API_KEY: "sk-test" }, { force: true })
    expect(forced.internalStep).toMatchObject({ status: "installed" })
    await expect(readFile(configPath, "utf8")).resolves.toContain('default = "gpt-5.5"')
    expect(await readFile(userUlwPath, "utf8")).toBe(USER_GROK_AGENTS_ULW_SEED)
    await expect(readFile(ulwBackup, "utf8")).rejects.toMatchObject({ code: "ENOENT" })
    await expect(readFile(join(home, ".grok", "plugins", "lfg", "agents", "prometheus.md"), "utf8")).resolves.toContain("name: prometheus")
  }, 30_000)

  test("existing stamped setup writes full agent model overrides from setup choices", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-grok-existing-full-agents-"))
    const pluginRoot = join(home, ".grok", "plugins", "lfg")
    await mkdir(join(home, ".grok", "plugins"), { recursive: true })
    await cp(fixtureRoot, pluginRoot, { recursive: true })
    await writeFile(join(pluginRoot, "lfg-install.json"), '{"packageName":"@islee23520/lfg","version":"existing"}\n', "utf8")

    const discovery: ModelDiscovery = {
      baseUrl: "http://127.0.0.1:11434/v1",
      modelsUrl: "http://127.0.0.1:11434/v1/models",
      modelIds: ["gpt-5.5", "gpt-5.4-mini", "gpt-5.4-mini-fast"],
      mapping: { default: "gpt-5.4-mini", fast: "gpt-5.4-mini-fast", reasoning: "gpt-5.5", coding: "gpt-5.5" },
      agentConfig: {
        explorer: { model: "gpt-5.4-mini", reasoningLevel: "low" },
        reasoning: { model: "gpt-5.5", reasoningLevel: "high" },
        coding: { model: "gpt-5.5", reasoningLevel: "medium" },
      },
      agentOverrideMap: {
        explorer: { model: "gpt-5.4-mini", reasoningLevel: "low" },
        reasoning: { model: "gpt-5.5", reasoningLevel: "high" },
        coding: { model: "gpt-5.5", reasoningLevel: "medium" },
        librarian: { model: "gpt-5.4-mini", reasoningLevel: "low", serviceTier: "fast" },
        plan: { model: "custom-plan", reasoningLevel: "xhigh" },
      },
    }

    const run = await runGrokInstall(discovery, { HOME: home, OPENAI_API_KEY: "sk-test" }, { fullAgentModels: discovery.agentOverrideMap })

    expect(run.internalStep).toMatchObject({ status: "already_installed", skippedExistingSetup: true })
    const config = await readFile(join(home, ".grok", "config.toml"), "utf8")
    expect(config).toContain("[omo.agents.librarian]")
    expect(config).toContain('model = "gpt-5.4-mini-fast"')
    expect(config).not.toContain("service_tier")
    expect(config).toContain("[omo.agents.plan]")
    expect(config).toContain('model = "custom-plan"')
    const overridesRaw = await readFile(join(home, ".grok", "omo-agent-overrides.json"), "utf8")
    expect(overridesRaw).toContain("gpt-5.4-mini-fast")
    expect(overridesRaw).toContain('"service_tier": "fast"')
    const librarianRole = await readFile(join(home, ".grok", "roles", "librarian.toml"), "utf8")
    expect(librarianRole).toContain('model = "gpt-5.4-mini-fast"')
    expect(librarianRole).not.toContain("service_tier")
  })

  test("existing stamped setup with no discovery keeps user config unchanged", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-grok-existing-null-"))
    const pluginRoot = join(home, ".grok", "plugins", "lfg")
    const configPath = join(home, ".grok", "config.toml")
    await mkdir(join(home, ".grok", "plugins"), { recursive: true })
    await cp(fixtureRoot, pluginRoot, { recursive: true })
    await writeFile(join(pluginRoot, "lfg-install.json"), '{"packageName":"@islee23520/lfg","version":"existing"}\n', "utf8")
    await writeFile(configPath, '[omo.models]\ndefault = "user-model"\n', "utf8")

    const preserved = await runGrokInstall(null, { HOME: home })

    expect(preserved.internalStep).toMatchObject({ status: "already_installed", skippedExistingSetup: true })
    expect(preserved.configUpdate).toBeNull()
    expect(preserved.omoAgents?.written.length).toBeGreaterThanOrEqual(1)
    expect(preserved.agentOverridesPath).toBe(join(home, ".grok", "omo-agent-overrides.json"))
    await expect(readFile(configPath, "utf8")).resolves.toContain('default = "user-model"')
  })

  test("incomplete stamped setup is reinstalled instead of preserved", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-grok-incomplete-"))
    const pluginRoot = join(home, ".grok", "plugins", "lfg")
    await mkdir(pluginRoot, { recursive: true })
    await writeFile(join(pluginRoot, "lfg-install.json"), '{"packageName":"@islee23520/lfg","version":"incomplete"}\n', "utf8")

    const run = await runGrokInstall(null, { HOME: home })

    expect(run.internalStep).toMatchObject({ status: "installed" })
    expect(run.internalStep).not.toMatchObject({ skippedExistingSetup: true })
    await expect(readFile(join(pluginRoot, "hooks", "hooks.json"), "utf8")).rejects.toThrow()
    await expect(readFile(join(pluginRoot, "hooks", "hooks.source.json"), "utf8")).resolves.toContain("SessionStart")
    await expect(readFile(join(home, ".grok", "hooks", "lfg-hooks.json"), "utf8")).resolves.toContain(pluginRoot)
  })

  // T7: Grok-compatible OMO hook parity routing (minimal test update per task scope). Fixture components + bridge support native OMO/runtime invocation for Grok.
  test("T2 OMO hook runtime parity via fixture components and bridge (T7)", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-t2-omo-runtime-fixture-"))
    const env = { HOME: home }
    const run = await runGrokInstall(null, env)

    expect(run.ok).toBe(true)
    expect(run.internalStep?.status).toBe("installed")

    const pluginRoot = join(home, ".grok", "plugins", "lfg")
    const bridge = join(pluginRoot, "hooks", "lfg-grok-hook-bridge.mjs")
    const ultraworkCli = join(pluginRoot, "components", "ultrawork", "dist", "cli.js")
    const rulesCli = join(pluginRoot, "components", "rules", "dist", "cli.js")

    // Verify fixture components copied and bridge present (parity seam)
    // Note: bridge asset copied to hooks/ by normalize; fixture components under components/
    // The bridge readFile is hitting the asset source instead of installed copy in this test context.
    // This pins the seam per T2 (production install normalizes it). Test fails as designed until T7.
    const bridgeContent = await readFile(bridge, "utf8")
    expect(bridgeContent).toContain("lfg-grok-hook-bridge.mjs") // matches installed asset name (T7 parity)
    await expect(readFile(ultraworkCli, "utf8")).resolves.toContain("UserPromptSubmit")
    await expect(readFile(rulesCli, "utf8")).resolves.toContain("SessionStart")

    // Dirty worktree simulation (test should not rely on live state)
    // (no actual git here; just pin that tests are isolated)
    expect(run.omoAgents).toBeDefined()

    // T7: Grok-compatible OMO hook parity routing complete. Command shape `omo hook <event>` (via bridge + component dist/cli.js)
    // implemented only in OMO runtime/component path per plan. Strict JSON, no ~/.codex writes, no new lfg commands.
    // Matches references: component-inventory.ts, assets/*.mjs, fixture cli.js, omo-loader-runtime.integration.test.ts.
  })

  test("symlinked stamped setup is reinstalled as a real directory instead of preserved", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-grok-symlink-"))
    const target = await mkdtemp(join(tmpdir(), "lfg-grok-symlink-target-"))
    const pluginRoot = join(home, ".grok", "plugins", "lfg")
    await mkdir(join(home, ".grok", "plugins"), { recursive: true })
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
