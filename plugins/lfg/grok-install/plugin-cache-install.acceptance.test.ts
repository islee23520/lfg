import { access, mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"
import { installGrokPluginFromSource } from "./install"
import { runGrokInstall } from "./run-grok-install"
import { verifyGrokInstallSurface } from "./post-install-verify"

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), "fixture-minimal")

/** Epic #27 / plan task 3 — fixture-only, no network. */
describe("plugin cache install acceptance (#27)", () => {
  test("syncs fixture to ~/.grok/installed-plugins/lfg", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-accept-install-"))
    await installGrokPluginFromSource({ home, sourceRoot: FIXTURE, version: "3.3.3" })
    const pluginRoot = join(home, ".grok", "installed-plugins", "lfg")
    await access(join(pluginRoot, "hooks", "hooks.json"))
    const verify = await verifyGrokInstallSurface({ home })
    expect(verify).toMatchObject({ ok: true, status: "verified", pluginDirName: "lfg" })
  })

  test("writes lfg-install.json stamp at Grok plugin root", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-accept-stamp-"))
    await installGrokPluginFromSource({ home, sourceRoot: FIXTURE, version: "4.4.4" })
    const raw = await readFile(join(home, ".grok", "installed-plugins", "lfg", "lfg-install.json"), "utf8")
    expect(JSON.parse(raw)).toEqual({
      packageName: "@islee23520/lfg",
      version: "4.4.4",
      platform: "grok",
    })
  })

  test("writes versioned component inventory at Grok plugin root", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-accept-inventory-"))
    await installGrokPluginFromSource({ home, sourceRoot: FIXTURE, version: "5.5.5" })
    const raw = await readFile(join(home, ".grok", "installed-plugins", "lfg", "lfg-component-inventory.json"), "utf8")
    const inventory = JSON.parse(raw) as {
      readonly inventoryVersion: number
      readonly packageName: string
      readonly packageVersion: string
      readonly platform: string
      readonly components: readonly { readonly id: string; readonly status: string }[]
    }
    expect(inventory).toMatchObject({
      inventoryVersion: 1,
      packageName: "@islee23520/lfg",
      packageVersion: "5.5.5",
      platform: "grok",
    })
    expect(inventory.components.map((component) => component.id)).toEqual([
      "comment-checker",
      "git-bash",
      "rules",
      "lsp",
      "ultrawork",
      "ulw-loop",
      "start-work-continuation",
      "telemetry",
    ])
    expect(inventory.components.every((component) => component.status.length > 0)).toBe(true)
  })

  test("second runGrokInstall is idempotent for stamp and verify", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-accept-idem-"))
    const discovery = {
      baseUrl: "http://127.0.0.1:11434/v1",
      modelsUrl: "http://127.0.0.1:11434/v1/models",
      modelIds: ["gpt-4.1-mini"],
      mapping: { default: "gpt-4.1-mini", fast: "gpt-4.1-mini", reasoning: "gpt-4.1-mini", coding: "gpt-4.1-mini" },
    }
    const env = { HOME: home, OPENAI_API_KEY: "sk-test" }
    await runGrokInstall(discovery, env)
    const stampPath = join(home, ".grok", "installed-plugins", "lfg", "lfg-install.json")
    const firstStamp = await readFile(stampPath, "utf8")
    const firstVerify = await verifyGrokInstallSurface({ home })
    await runGrokInstall(discovery, env)
    const secondStamp = await readFile(stampPath, "utf8")
    const secondVerify = await verifyGrokInstallSurface({ home })
    expect(secondStamp).toBe(firstStamp)
    expect(secondVerify).toEqual(firstVerify)
    expect(firstVerify.ok).toBe(true)
  })
})
