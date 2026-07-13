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
import { NATIVE_HEPHAESTUS_MARKER, NATIVE_SISYPHUS_MARKER } from "../agents/native-omo-agents"

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
  test("default/hephaestus roles point at prompt files with OMO markers", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-prompt-role-"))
    const run = await runGrokInstall(null, { HOME: home, LFG_ALLOW_TEST_GROK_HOME: "1" })
    expect(run.ok).toBe(true)

    const defaultRole = await readFile(join(home, ".grok", "roles", "default.toml"), "utf8")
    const hephaestusRole = await readFile(join(home, ".grok", "roles", "hephaestus.toml"), "utf8")
    expect(defaultRole).toMatch(/prompt_file\s*=/)
    expect(hephaestusRole).toMatch(/prompt_file\s*=/)

    const defaultPromptPath = defaultRole.match(/prompt_file\s*=\s*"([^"]+)"/)?.[1]
    const hephaestusPromptPath = hephaestusRole.match(/prompt_file\s*=\s*"([^"]+)"/)?.[1]
    expect(defaultPromptPath).toBeTruthy()
    expect(hephaestusPromptPath).toBeTruthy()

    const defaultPrompt = await readFile(defaultPromptPath!, "utf8")
    const hephaestusPrompt = await readFile(hephaestusPromptPath!, "utf8")
    expect(defaultPrompt).toContain(NATIVE_SISYPHUS_MARKER)
    expect(hephaestusPrompt).toContain(NATIVE_HEPHAESTUS_MARKER)

    const pluginRoot = join(home, ".grok", "plugins", "lfg")
    const native = await verifyNativeOmoAgents(pluginRoot, home)
    expect(native.status).toBe("verified")
    expect(native.sisyphusDefaultAgent).toBe(true)
    expect(native.hephaestusPromptPresent).toBe(true)

    // T-PROMPT-USER-AGENT-01: host loads ~/.grok/agents/<default>.md for main session
    const userSisyphus = await readFile(join(home, ".grok", "agents", "sisyphus.md"), "utf8")
    expect(userSisyphus).toContain(NATIVE_SISYPHUS_MARKER)
    const config = await readFile(join(home, ".grok", "config.toml"), "utf8")
    expect(config).toMatch(/\[agents\][\s\S]*default\s*=\s*"sisyphus"/)
    expect(config).toMatch(/\[agent\][\s\S]*name\s*=\s*"sisyphus"/)
  })
})
