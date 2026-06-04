import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join, resolve } from "node:path"
import type { JsonObject } from "./lfg-json"
import { stableInstalledPluginPath, type StablePluginName } from "./lfg-stable-plugin"

export type LazycodexAdapter = {
  readonly found: boolean
  readonly root: string
  readonly manifest: string
  readonly mcpConfig: string
  readonly skillsDir: string
}

export function detectLazycodexAdapter(options: { readonly preferStableInstalledPlugin?: boolean; readonly preferHashInstalledPlugin?: boolean } = {}): LazycodexAdapter {
  const root = lazycodexAdapterRoot(options)
  const manifest = join(root, ".codex-plugin", "plugin.json")
  const mcpConfig = join(root, ".mcp.json")
  const skillsDir = join(root, "skills")
  return {
    found: existsSync(manifest),
    root,
    manifest,
    mcpConfig,
    skillsDir,
  }
}

export function grokSurfaces(): JsonObject {
  const cwd = process.cwd()
  return {
    customModelConfig: join(homedir(), ".grok", "config.toml"),
    globalAgentRoot: join(homedir(), ".grok", "agents"),
    projectAgentRoot: resolve(cwd, ".grok", "agents"),
    acpCommand: "grok agent stdio",
    globalPluginRoot: join(homedir(), ".grok", "plugins"),
    projectPluginRoot: resolve(cwd, ".grok", "plugins"),
    userMcpConfig: join(homedir(), ".grok", "config.toml"),
    projectMcpConfig: resolve(cwd, ".grok", "config.toml"),
    projectRootMcpConfig: resolve(cwd, ".mcp.json"),
  }
}

export function grokVerificationCommands(): readonly string[] {
  return ["grok models", "grok -m <model>", "/model <model>", "grok agent stdio", "grok inspect --json", "grok plugin list --json", "grok plugin details <name>"]
}

function lazycodexAdapterRoot(options: { readonly preferStableInstalledPlugin?: boolean; readonly preferHashInstalledPlugin?: boolean }): string {
  const configured = process.env.LAZYCODEX_ADAPTER_ROOT
  if (configured) return resolve(configured)

  for (const name of ["lazycodex", "lfg"] satisfies readonly StablePluginName[]) {
    const stableInstalledPlugin = stableInstalledPluginPath(name)
    if (options.preferStableInstalledPlugin !== false && existsSync(join(stableInstalledPlugin, ".codex-plugin", "plugin.json"))) return resolve(stableInstalledPlugin)
  }

  const installedPlugin = join(homedir(), ".grok", "installed-plugins", "0-1-0-ff47fdd7")
  if (options.preferHashInstalledPlugin === true && existsSync(join(installedPlugin, ".codex-plugin", "plugin.json"))) return resolve(installedPlugin)

  const primary = join(homedir(), ".grok", "plugins", "lazycodex")
  if (existsSync(join(primary, ".codex-plugin", "plugin.json"))) return resolve(primary)

  if (existsSync(join(installedPlugin, ".codex-plugin", "plugin.json"))) return resolve(installedPlugin)

  return resolve(primary)
}
