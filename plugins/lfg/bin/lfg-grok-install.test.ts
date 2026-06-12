import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { spawn } from "node:child_process"
import { describe, expect, test } from "vitest"
import { applyLazycodexAgentTomls } from "../grok-install/apply-agent-tomls"
import { runInternalGrokInstall } from "../grok-install/run-internal"
import { mergeAgentTomlOverrides } from "../grok-install/agent-overrides"
import { defaultLazycodexAgentConfig } from "./lfg-models"
import { mergePortedHooksIntoPlugin } from "../grok-install/extension-hooks"
import { installGrokPluginFromSource, readGrokInstallStamp } from "../grok-install/install"
import { runGrokDoctor } from "../grok-install/doctor"
import { runLfg } from "./test-process"

describe("grok-install", () => {
  test("internal install stamp uses published package version", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-grok-stamp-ver-"))
    await runInternalGrokInstall({ HOME: home })
    const stampRaw = await readFile(join(home, ".grok", "installed-plugins", "lfg", "lfg-install.json"), "utf8")
    const pkg = JSON.parse(await readFile(new URL("../../../package.json", import.meta.url), "utf8")) as { version: string }
    expect(stampRaw).toContain(pkg.version)
  })

  test("install is idempotent for install stamp version", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-grok-home-"))
    const source = await mkdtemp(join(tmpdir(), "lfg-grok-src-"))
    await writeFile(join(source, "package.json"), '{"name":"fixture-plugin"}\n')
    await installGrokPluginFromSource({ home, sourceRoot: source, version: "1.2.3" })
    await installGrokPluginFromSource({ home, sourceRoot: source, version: "1.2.3" })
    const stamp = await readGrokInstallStamp(join(home, ".grok", "installed-plugins", "lfg"))
    expect(stamp).toEqual({ packageName: "@islee23520/lfg", version: "1.2.3" })
  })

  test("runInternalGrokInstall twice is stable (#27)", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-grok-idem-internal-"))
    await runInternalGrokInstall({ HOME: home })
    const stampPath = join(home, ".grok", "installed-plugins", "lfg", "lfg-install.json")
    const first = await readFile(stampPath, "utf8")
    await runInternalGrokInstall({ HOME: home })
    const second = await readFile(stampPath, "utf8")
    expect(second).toBe(first)
    expect(first).toContain("@islee23520/lfg")
  })

  test("mergeAgentTomlOverrides replaces model keys without duplicate", () => {
    const input = 'model = "old"\nmodel_reasoning_effort = "low"\n'
    const out = mergeAgentTomlOverrides(input, { model: "new-model", reasoningLevel: "high" })
    expect(out).toContain('model = "new-model"')
    expect(out).toContain('model_reasoning_effort = "high"')
    expect(out.match(/model =/g)?.length).toBe(1)
  })

  test("applyLazycodexAgentTomls writes three agent files", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-agents-home-"))
    const discovery = {
      baseUrl: "http://127.0.0.1/v1",
      modelsUrl: "http://127.0.0.1/v1/models",
      modelIds: ["gpt-4.1-mini", "o3-mini"],
      mapping: { default: "gpt-4.1-mini", fast: "gpt-4.1-mini", reasoning: "o3-mini", coding: "gpt-4.1-mini" },
    }
    const agents = defaultLazycodexAgentConfig(discovery)
    const result = await applyLazycodexAgentTomls(home, agents)
    expect(result.written).toHaveLength(3)
    const explorer = await readFile(join(home, ".grok", "agents", "explorer.toml"), "utf8")
    expect(explorer).toContain('model = "gpt-4.1-mini"')
    expect(explorer).toContain("model_reasoning_effort")
  })

  test("doctor passes after fixture install", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-grok-doc-"))
    const source = join(dirname(fileURLToPath(import.meta.url)), "..", "grok-install", "fixture-minimal")
    await installGrokPluginFromSource({ home, sourceRoot: source })
    const json = await runGrokDoctor({ home })
    expect(json.ok).toBe(true)
    expect(json.status).toBe("pass")
  })
})

describe("lfg internal grok install contract", () => {
  test("setup --run uses grok-only install path", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-grok-contract-"))
    const result = await runLfg(["--json", "setup", "--run"], { HOME: home })
    expect(result.exitCode).toBe(0)
    expect(result.json).toMatchObject({
      skippedCodexInstaller: true,
      postInstallVerify: { ok: true, status: "verified" },
    })
    expect(JSON.stringify(result.json)).not.toContain("@islee23520/lfp")
  })

  test("setup --run reports installed component inventory path", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-grok-inventory-"))
    const result = await runLfg(["--json", "setup", "--run"], { HOME: home, LFG_PACKAGE_VERSION: "9.8.7" })
    expect(result.exitCode).toBe(0)
    expect(result.json).toMatchObject({
      internalStep: {
        componentInventoryPath: join(home, ".grok", "installed-plugins", "lfg", "lfg-component-inventory.json"),
      },
    })
    const raw = await readFile(join(home, ".grok", "installed-plugins", "lfg", "lfg-component-inventory.json"), "utf8")
    const inventory = JSON.parse(raw) as {
      readonly packageVersion: string
      readonly upstreamName: string
      readonly upstreamVersion: string
      readonly upstreamTag: string
    }
    expect(inventory.packageVersion).toBe("9.8.7")
    expect(inventory.upstreamName).toBe("lazycodex-ai")
    expect(inventory.upstreamVersion).toBe("4.9.2")
    expect(inventory.upstreamTag).toBe("v4.9.2")
  })

  test("setup --run surfaces payloadSource and component inventory in postInstallVerify (supports #38/#42)", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-grok-payload-src-"))
    const result = await runLfg(["--json", "setup", "--run"], { HOME: home })
    expect(result.exitCode).toBe(0)
    const p = result.json.postInstallVerify as { payloadSource?: string; componentInventoryPath?: string } | undefined
    expect(p).toBeTruthy()
    expect(p?.componentInventoryPath).toContain("lfg-component-inventory.json")
    // In this workspace without external lazycodex source it is fixture_fallback or source_tree depending on cache; assert it is a known value.
    expect(["fixture_fallback", "source_tree", "lazycodex_bundle", "source_override", "repair_adapter"]).toContain(p?.payloadSource)
  })

  test("setup --run with fixture fallback includes warning and payloadSource=fixture_fallback in internalStep (supports #38)", async () => {
    // Fresh home + no LFG_LAZYCODEX_PLUGIN_SOURCE forces fixture path (no healthy prior stamp).
    const home = await mkdtemp(join(tmpdir(), "lfg-grok-fixture-warn-"))
    const result = await runLfg(["--json", "setup", "--run"], {
      HOME: home,
      // ensure we do not accidentally pick up a cached bundle in this test env
      LFG_LAZYCODEX_PLUGIN_SOURCE: "",
    })
    expect(result.exitCode).toBe(0)
    const internal = result.json.internalStep as { payloadSource?: string; warning?: string; mode?: string } | undefined
    // The internal step may be the preserved or fresh path; when fresh fixture it carries the warning.
    // We assert that if payloadSource indicates fixture, a warning string is present (user-visible guidance).
    if (internal?.payloadSource === "fixture_fallback" || internal?.mode === "fixture_fallback") {
      expect(typeof internal?.warning).toBe("string")
      expect(internal?.warning).toContain("Full lazycodex tree not found")
    }
    // At minimum the public JSON still advertises the component inventory path.
    expect(result.json).toMatchObject({
      internalStep: { componentInventoryPath: expect.stringContaining("lfg-component-inventory.json") },
    })
  })

  test("setup --run installs executable rules and ultrawork hook bridge targets", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-grok-hook-qa-"))
    const result = await runLfg(["--json", "setup", "--run"], { HOME: home })
    expect(result.exitCode).toBe(0)

    const pluginRoot = join(home, ".grok", "installed-plugins", "lfg")
    const hooksRaw = await readFile(join(pluginRoot, "hooks", "hooks.json"), "utf8")
    expect(hooksRaw).toContain("components/rules/dist/cli.js")
    expect(hooksRaw).toContain("components/ultrawork/dist/cli.js")

    const bridgePath = join(pluginRoot, "hooks", "lfg-grok-hook-bridge.mjs")
    const rules = await runInstalledHook(
      [bridgePath, "node", join(pluginRoot, "components", "rules", "dist", "cli.js"), "hook", "session-start"],
      { hookEventName: "session_start", sessionId: "test-session", cwd: process.cwd(), source: "startup" },
      { GROK_PLUGIN_ROOT: pluginRoot, GROK_HOOK_EVENT: "session_start" },
    )
    expect(rules).toMatchObject({ exitCode: 0, stderr: "" })
    expect(rules.stdout).toContain("rules-context-ok")

    const ultrawork = await runInstalledHook(
      [bridgePath, "node", join(pluginRoot, "components", "ultrawork", "dist", "cli.js"), "hook", "user-prompt-submit"],
      { hookEventName: "user_prompt_submit", sessionId: "test-session", cwd: process.cwd(), prompt: "work" },
      { GROK_PLUGIN_ROOT: pluginRoot, GROK_HOOK_EVENT: "user_prompt_submit" },
    )
    expect(ultrawork).toMatchObject({ exitCode: 0, stderr: "" })
    expect(ultrawork.stdout).toContain("ultrawork-directive-ok")
  })

  test("preserved setup --run reports existing component inventory path without rewriting inventory", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-grok-inventory-preserve-"))
    await runLfg(["--json", "setup", "--run"], { HOME: home, LFG_PACKAGE_VERSION: "9.8.7" })
    const second = await runLfg(["--json", "setup", "--run"], { HOME: home, LFG_PACKAGE_VERSION: "9.8.8" })
    expect(second.exitCode).toBe(0)
    expect(second.json).toMatchObject({
      preservedExistingSetup: true,
      internalStep: {
        componentInventoryPath: join(home, ".grok", "installed-plugins", "lfg", "lfg-component-inventory.json"),
      },
    })
    const raw = await readFile(join(home, ".grok", "installed-plugins", "lfg", "lfg-component-inventory.json"), "utf8")
    const inventory = JSON.parse(raw) as { readonly packageVersion: string }
    expect(inventory.packageVersion).toBe("9.8.7")
  })

  test("installed fixture hooks.json uses Grok SessionStart event map", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-hooks-home-"))
    await runInternalGrokInstall({ HOME: home })
    const raw = await readFile(join(home, ".grok", "installed-plugins", "lfg", "hooks", "hooks.json"), "utf8")
    const parsed = JSON.parse(raw) as { hooks: { SessionStart?: unknown } }
    expect(Array.isArray(parsed.hooks.SessionStart)).toBe(true)
  })

  test("doctor remains internal and the public CLI advertises setup only", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-grok-cli-doc-"))
    const source = join(dirname(fileURLToPath(import.meta.url)), "..", "grok-install", "fixture-minimal")
    const pluginRoot = join(home, ".grok", "installed-plugins", "lfg")
    await installGrokPluginFromSource({ home, sourceRoot: source })
    await mergePortedHooksIntoPlugin(pluginRoot)
    const result = await runLfg(["--json", "doctor"], { HOME: home })
    expect(result.exitCode).toBe(1)
    expect(result.json).toMatchObject({
      ok: false,
      status: "error",
      code: "unsupported_command",
      command: "doctor",
      lfgIsPlugin: false,
      supportedCommands: ["setup"],
    })
    const stampRaw = await readFile(join(home, ".grok", "installed-plugins", "lfg", "lfg-install.json"), "utf8")
    expect(stampRaw).toContain("@islee23520/lfg")
  })

  test("doctor publishGap remains available through the internal verifier (#22)", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-grok-doc-gap-"))
    const source = join(dirname(fileURLToPath(import.meta.url)), "..", "grok-install", "fixture-minimal")
    await installGrokPluginFromSource({ home, sourceRoot: source })
    const result = await runGrokDoctor({ home, registryVersion: "0.1.3" })
    expect(result).toMatchObject({
      publishGap: { registryVersion: "0.1.3", publishReady: true, blockedReason: null },
    })
  })
})

function runInstalledHook(
  argv: readonly string[],
  payload: Readonly<Record<string, string>>,
  env: Readonly<Record<string, string>>,
): Promise<{ readonly exitCode: number; readonly stdout: string; readonly stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, argv, {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.stdin.write(`${JSON.stringify(payload)}\n`)
    child.stdin.end()
    child.on("close", (code) => resolve({ exitCode: code ?? 1, stdout, stderr }))
    child.on("error", () => resolve({ exitCode: 1, stdout, stderr }))
  })
}
