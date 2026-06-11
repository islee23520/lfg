import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
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
