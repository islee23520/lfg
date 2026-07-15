import { mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { runGrokInstall } from "./run-grok-install"
import {
  expectGrokBuildSkillActivationSurface,
  expectUpstreamOmoWorkflowSkills,
} from "../test/test-omo-skills-assertions"
import { verifyNativeOmoAgents } from "../agents/native-agent-verify"
import { NATIVE_DEFAULT_AGENT_MARKER } from "../agents/native-omo-agents"

describe("T-SKILL-INSTALL-01 GrokBuild skills install surface", () => {
  test("setup materializes managed skills with slash activation metadata", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-skills-surface-"))
    const run = await runGrokInstall(null, { HOME: home, LFG_ALLOW_TEST_GROK_HOME: "1" })
    expect(run.ok).toBe(true)
    const pluginRoot = join(home, ".grok", "plugins", "lfg")
    await expectUpstreamOmoWorkflowSkills(pluginRoot)
    await expectGrokBuildSkillActivationSurface(pluginRoot)
  })
})

describe("T-PROMPT-ROLE-01 role prompt_file resolves to omo prompts", () => {
  test("sisyphus role points at its prompt and retired lazycodex surfaces are absent", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-prompt-role-"))
    const run = await runGrokInstall(null, { HOME: home, LFG_ALLOW_TEST_GROK_HOME: "1" })
    expect(run.ok).toBe(true)

    const defaultRole = await readFile(join(home, ".grok", "roles", "sisyphus.toml"), "utf8")
    expect(defaultRole).toMatch(/prompt_file\s*=/)

    const defaultPromptPath = defaultRole.match(/prompt_file\s*=\s*"([^"]+)"/)?.[1]
    expect(defaultPromptPath).toBeTruthy()

    const defaultPrompt = await readFile(defaultPromptPath!, "utf8")
    expect(defaultPrompt).toContain(NATIVE_DEFAULT_AGENT_MARKER)
    await expect(readFile(join(home, ".grok", "roles", "lazycodex.toml"), "utf8")).rejects.toMatchObject({ code: "ENOENT" })
    await expect(readFile(join(home, ".grok", "prompts", "omo", "lazycodex.md"), "utf8")).rejects.toMatchObject({ code: "ENOENT" })

    const pluginRoot = join(home, ".grok", "plugins", "lfg")
    const native = await verifyNativeOmoAgents(pluginRoot, home)
    expect(native.status).toBe("verified")
    expect(native.watcherDefaultAgent).toBe(true)
    expect(native.retiredLazycodexAbsent).toBe(true)

    const userWatcher = await readFile(join(home, ".grok", "agents", "sisyphus.md"), "utf8")
    expect(userWatcher).toContain(NATIVE_DEFAULT_AGENT_MARKER)
  })
})
