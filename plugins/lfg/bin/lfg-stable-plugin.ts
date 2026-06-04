import { lstat, mkdir, readlink, symlink, unlink } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"
import type { LazycodexAdapter } from "./lfg-grok"

export const STABLE_PLUGIN_NAMES = ["lfg", "lazycodex"] as const
export type StablePluginName = (typeof STABLE_PLUGIN_NAMES)[number]
export const LFG_STABLE_PLUGIN_NAME = "lfg"

export type StablePluginLink =
  | {
      readonly status: "linked"
      readonly name: StablePluginName
      readonly linkPath: string
      readonly targetPath: string
    }
  | {
      readonly status: "missing_adapter"
      readonly name: StablePluginName
      readonly linkPath: string
    }
  | {
      readonly status: "conflict"
      readonly name: StablePluginName
      readonly linkPath: string
      readonly targetPath: string
      readonly reason: string
    }
  | {
      readonly status: "error"
      readonly name: StablePluginName
      readonly linkPath: string
      readonly targetPath: string
      readonly error: string
    }

export function stableInstalledPluginPath(name: StablePluginName = LFG_STABLE_PLUGIN_NAME): string {
  return join(homedir(), ".grok", "installed-plugins", name)
}

export async function ensureStablePluginLinks(adapter: LazycodexAdapter): Promise<readonly StablePluginLink[]> {
  return Promise.all(STABLE_PLUGIN_NAMES.map((name) => ensureStablePluginLink(adapter, name)))
}

export async function ensureStableLfgPluginLink(adapter: LazycodexAdapter): Promise<StablePluginLink> {
  return ensureStablePluginLink(adapter, LFG_STABLE_PLUGIN_NAME)
}

async function ensureStablePluginLink(adapter: LazycodexAdapter, name: StablePluginName): Promise<StablePluginLink> {
  const linkPath = stableInstalledPluginPath(name)
  if (!adapter.found) return { status: "missing_adapter", name, linkPath }

  const targetPath = resolve(adapter.root)
  try {
    await mkdir(dirname(linkPath), { recursive: true })
    const current = await readExistingLink(linkPath)
    if (current.status === "directory_or_file") {
      return {
        status: "conflict",
        name,
        linkPath,
        targetPath,
        reason: `Refusing to replace an existing non-symlink ${name} installed-plugin entry.`,
      }
    }
    if (current.status === "symlink") {
      if (resolve(dirname(linkPath), current.target) === targetPath) return { status: "linked", name, linkPath, targetPath }
      await unlink(linkPath)
    }
    await symlink(targetPath, linkPath, process.platform === "win32" ? "junction" : "dir")
    return { status: "linked", name, linkPath, targetPath }
  } catch (error) {
    return { status: "error", name, linkPath, targetPath, error: error instanceof Error ? error.message : String(error) }
  }
}

async function readExistingLink(path: string): Promise<{ readonly status: "missing" } | { readonly status: "symlink"; readonly target: string } | { readonly status: "directory_or_file" }> {
  try {
    const stat = await lstat(path)
    if (!stat.isSymbolicLink()) return { status: "directory_or_file" }
    return { status: "symlink", target: await readlink(path) }
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return { status: "missing" }
    throw error
  }
}
