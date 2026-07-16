import { createHash } from "node:crypto"
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"
import { mergePortedHooksIntoPlugin } from "../hooks/extension-hooks"
import { installGrokPluginFromSource } from "../payload/install"
import { runGrokInstall } from "./run-grok-install"
import { verifyGrokInstallSurface } from "../doctor/post-install-verify"

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), "..", "fixture")
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..")
const NATIVE_SKILL_FILES = ["SKILL.md", join("agents", "grok.yaml")] as const
const T2_COMPONENT_IDS = [
  "rules",
  "lsp",
  "comment-checker",
  "git-bash",
  "ultrawork",
  "ulw-loop",
  "start-work-continuation",
  "telemetry",
  "bootstrap",
  "auto-update",
  "ast_grep",
  "grep_app",
  "context7",
  "agent-builder",
  "delegate-core",
  "boulder-state",
  "skills-loader-core",
  "teammode",
  "lazycodex-executor-verify",
  "workflow-selector",
  "test-support",
] as const

/** Epic #27 / plan task 3 — fixture-only, no network. */
describe("plugin cache install acceptance (#27)", () => {
  test("syncs fixture to ~/.grok/plugins/lfg", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-accept-install-"))
    await installGrokPluginFromSource({ home, sourceRoot: FIXTURE, version: "3.3.3" })
    const pluginRoot = join(home, ".grok", "plugins", "lfg")
    await mergePortedHooksIntoPlugin(pluginRoot)
    await expect(readFile(join(pluginRoot, "hooks", "hooks.json"), "utf8")).rejects.toThrow()
    await access(join(pluginRoot, "hooks", "hooks.source.json"))
    await access(join(home, ".grok", "hooks", "lfg-hooks.json"))
    const verify = await verifyGrokInstallSurface({ home })
    expect(verify).toMatchObject({ ok: true, status: "verified", pluginDirName: "lfg" })
  })

  test("writes lfg-install.json stamp at Grok plugin root", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-accept-stamp-"))
    await installGrokPluginFromSource({ home, sourceRoot: FIXTURE, version: "4.4.4" })
    const raw = await readFile(join(home, ".grok", "plugins", "lfg", "lfg-install.json"), "utf8")
    expect(JSON.parse(raw)).toEqual({
      packageName: "@islee23520/lfg",
      version: "4.4.4",
      platform: "grok",
    })
  })

  test("writes versioned component inventory at Grok plugin root", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-accept-inventory-"))
    await installGrokPluginFromSource({ home, sourceRoot: FIXTURE, version: "5.5.5" })
    const raw = await readFile(join(home, ".grok", "plugins", "lfg", "lfg-component-inventory.json"), "utf8")
    const inventory = JSON.parse(raw) as {
      readonly inventoryVersion: number
      readonly packageName: string
      readonly packageVersion: string
      readonly platform: string
      readonly upstreamName: string
      readonly upstreamVersion: string
      readonly upstreamTag: string
      readonly upstreamReleaseUrl: string
      readonly components: readonly { readonly id: string; readonly status: string; readonly evidence: string }[]
    }
    expect(inventory).toMatchObject({
      inventoryVersion: 1,
      packageName: "@islee23520/lfg",
      packageVersion: "5.5.5",
      platform: "grok",
      upstreamName: "oh-my-openagent",
      upstreamVersion: "4.16.3",
      upstreamTag: "v4.16.3",
      upstreamReleaseUrl: "https://github.com/code-yeongyu/oh-my-openagent/releases/tag/v4.16.3",
    })
    expect(inventory.components.map((component) => component.id)).toEqual(expect.arrayContaining([...T2_COMPONENT_IDS]))
    expect(inventory.components.every((component) => component.status.length > 0)).toBe(true)
    expect(inventory.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "ast_grep", status: "Grok-adapted" }),
        expect.objectContaining({ id: "lsp", status: "Grok-adapted" }),
        expect.objectContaining({ id: "comment-checker", status: "Grok-adapted" }),
        expect.objectContaining({ id: "git-bash", status: "Manifest-only" }),
        expect.objectContaining({ id: "grep_app", status: "Remote URL manifest-only" }),
        expect.objectContaining({ id: "context7", status: "Remote URL manifest-only" }),
        expect.objectContaining({ id: "teammode", status: "Grok-adapted" }),
        expect.objectContaining({ id: "lazycodex-executor-verify", status: "Deferred" }),
        expect.objectContaining({ id: "workflow-selector", status: "Deferred" }),
        expect.objectContaining({ id: "test-support", status: "Unsupported" }),
      ]),
    )
    expect(inventory.components.find((component) => component.id === "git-bash")?.evidence).toContain("Windows-unverified")
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
    const stampPath = join(home, ".grok", "plugins", "lfg", "lfg-install.json")
    const firstStamp = await readFile(stampPath, "utf8")
    const firstVerify = await verifyGrokInstallSurface({ home })
    await runGrokInstall(discovery, env)
    const secondStamp = await readFile(stampPath, "utf8")
    const secondVerify = await verifyGrokInstallSurface({ home })
    expect(secondStamp).toBe(firstStamp)
    expect(secondVerify).toEqual(firstVerify)
    expect(firstVerify.ok).toBe(true)
  })

  test("repeated runGrokInstall preserves user config.toml marker and does not duplicate hooks", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-accept-overrides-idem-"))
    const discovery = {
      baseUrl: "http://127.0.0.1:11434/v1",
      modelsUrl: "http://127.0.0.1:11434/v1/models",
      modelIds: ["gpt-4.1-mini"],
      mapping: { default: "gpt-4.1-mini", fast: "gpt-4.1-mini", reasoning: "gpt-4.1-mini", coding: "gpt-4.1-mini" },
    }
    const env = { HOME: home, OPENAI_API_KEY: "sk-test" }
    await runGrokInstall(discovery, env)
    const configPath = join(home, ".grok", "config.toml")
    const before = await readFile(configPath, "utf8")
    const withUserKey = `${before}\n[ui]\nuser-owned-config-key = "keep-me"\n`
    await writeFile(configPath, withUserKey, "utf8")

    await runGrokInstall(discovery, env)
    await runGrokInstall(discovery, env)

    expect(await readFile(configPath, "utf8")).toContain('user-owned-config-key = "keep-me"')
    const hooksRaw = await readFile(join(home, ".grok", "hooks", "lfg-hooks.json"), "utf8")
    const hooks = parseHooksCommands(hooksRaw)
    expect(countCommand(hooks, "lfg-config-loader.mjs")).toBe(3)
    expect(countCommand(hooks, "lfg-native-sisyphus-no-edit.mjs")).toBe(1)
    expect(countCommand(hooks, "lfg-native-orchestrator-inbox.mjs")).toBe(3)
    expect(countCommand(hooks, "lfg-native-codex-assign.mjs")).toBe(2)
  })
})

function parseHooksCommands(raw: string): readonly string[] {
  const parsed: unknown = JSON.parse(raw)
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return []
  const hooks = (parsed as { readonly hooks?: unknown }).hooks
  if (typeof hooks !== "object" || hooks === null || Array.isArray(hooks)) return []
  const commands: string[] = []
  for (const groups of Object.values(hooks as Record<string, unknown>)) {
    if (!Array.isArray(groups)) continue
    for (const group of groups) {
      if (typeof group !== "object" || group === null || Array.isArray(group)) continue
      const handlers = (group as { readonly hooks?: unknown }).hooks
      if (!Array.isArray(handlers)) continue
      for (const handler of handlers) {
        if (typeof handler !== "object" || handler === null || Array.isArray(handler)) continue
        const command = (handler as { readonly command?: unknown }).command
        if (typeof command === "string") commands.push(command)
      }
    }
  }
  return commands
}

function countCommand(commands: readonly string[], needle: string): number {
  return commands.filter((command) => command.includes(needle)).length
}

async function hashFile(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex")
}
