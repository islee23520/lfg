import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"
import { applyLazycodexAgentTomls } from "../grok-install/apply-agent-tomls"
import { runInternalGrokInstall } from "../grok-install/run-internal"
import { mergeAgentTomlOverrides } from "../grok-install/agent-overrides"
import { defaultLazycodexAgentConfig } from "./lfg-models"
import { installGrokPluginFromSource, readGrokInstallStamp } from "../grok-install/install"
import { runGrokDoctor } from "../grok-install/doctor"
import { runLfg } from "./test-process"

describe("grok-install", () => {
  test("internal install stamp uses published package version", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-grok-stamp-ver-"))
    await runInternalGrokInstall({ HOME: home })
    const stampRaw = await readFile(join(home, ".grok", "installed-plugins", "lazycodex", "lfg-install.json"), "utf8")
    expect(stampRaw).toContain("0.1.4")
  })

  test("install is idempotent for install stamp version", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-grok-home-"))
    const source = await mkdtemp(join(tmpdir(), "lfg-grok-src-"))
    await writeFile(join(source, "package.json"), '{"name":"fixture-plugin"}\n')
    await installGrokPluginFromSource({ home, sourceRoot: source, version: "1.2.3" })
    await installGrokPluginFromSource({ home, sourceRoot: source, version: "1.2.3" })
    const stamp = await readGrokInstallStamp(join(home, ".grok", "installed-plugins", "lazycodex"))
    expect(stamp).toEqual({ packageName: "@islee23520/lfg", version: "1.2.3" })
  })

  test("runInternalGrokInstall twice is stable (#27)", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-grok-idem-internal-"))
    await runInternalGrokInstall({ HOME: home })
    const stampPath = join(home, ".grok", "installed-plugins", "lazycodex", "lfg-install.json")
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
    const source = await mkdtemp(join(tmpdir(), "lfg-grok-src2-"))
    await writeFile(join(source, "README.md"), "fixture\n")
    await installGrokPluginFromSource({ home, sourceRoot: source })
    const json = await runGrokDoctor({ home })
    expect(json.ok).toBe(true)
    expect(json.status).toBe("pass")
  })
})

describe("lfg internal grok install contract", () => {
  test("setup --run does not invoke lfp npx", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-grok-contract-"))
    const fakeBin = await mkdtemp(join(tmpdir(), "lfg-fake-npx-contract-"))
    const body = `case "$*" in
  *lazycodex-ai*) echo fake lazycodex install: $* ;;
  *@islee23520/lfp*) echo unexpected lfp npx: $* >&2; exit 2 ;;
  *) echo unexpected npx: $* >&2; exit 2 ;;
esac`
    await writeFile(join(fakeBin, "npx"), `#!/usr/bin/env bash\n${body}\nexit 0\n`)
    await chmod(join(fakeBin, "npx"), 0o755)
    const result = await runLfg(["--json", "setup", "--run"], { HOME: home, PATH: `${fakeBin}:${process.env.PATH ?? ""}` })
    expect(result.exitCode).toBe(0)
    expect(JSON.stringify(result.json)).not.toContain("@islee23520/lfp")
    expect(result.json).toMatchObject({
      postInstallVerify: { ok: true, status: "verified" },
    })
  })

  test("installed fixture hooks.json registers lfg-visual-guidance", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-hooks-home-"))
    await runInternalGrokInstall({ HOME: home })
    const raw = await readFile(join(home, ".grok", "installed-plugins", "lazycodex", "hooks", "hooks.json"), "utf8")
    const parsed = JSON.parse(raw) as { hooks: readonly { name: string }[] }
    expect(parsed.hooks.some((hook) => hook.name === "lfg-visual-guidance")).toBe(true)
    expect(parsed.hooks.some((hook) => hook.name === "lfg-agent-reminder")).toBe(true)
  })

  test("doctor command returns JSON when plugin installed", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-grok-cli-doc-"))
    const source = join(dirname(fileURLToPath(import.meta.url)), "..", "grok-install", "fixture-minimal")
    await installGrokPluginFromSource({ home, sourceRoot: source })
    const result = await runLfg(["--json", "doctor"], { HOME: home })
    expect(result.exitCode).toBe(0)
    expect(result.json).toMatchObject({
      ok: true,
      status: "pass",
      command: "doctor",
      lfgIsPlugin: false,
      cli: { ok: true, required: true },
      installSurface: { status: "verified", hooksRegistered: true },
      failedRequired: [],
      checks: expect.arrayContaining([
        expect.objectContaining({ name: "cli", ok: true }),
        expect.objectContaining({ name: "grok_install_surface", ok: true }),
      ]),
    })
    const stampRaw = await readFile(join(home, ".grok", "installed-plugins", "lazycodex", "lfg-install.json"), "utf8")
    expect(stampRaw).toContain("@islee23520/lfg")
  })
})