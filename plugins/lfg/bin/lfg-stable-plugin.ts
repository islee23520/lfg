import { lstat, mkdir, readlink, symlink, unlink } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"
import type { LazycodexAdapter } from "./lfg-grok"

export const LFG_STABLE_PLUGIN_NAME = "lfg"

export type StablePluginLink =
  | {
      readonly status: "linked"
      readonly name: typeof LFG_STABLE_PLUGIN_NAME
      readonly linkPath: string
      readonly targetPath: string
    }
  | {
      readonly status: "missing_adapter"
      readonly name: typeof LFG_STABLE_PLUGIN_NAME
      readonly linkPath: string
    }
  | {
      readonly status: "conflict"
      readonly name: typeof LFG_STABLE_PLUGIN_NAME
      readonly linkPath: string
      readonly targetPath: string
      readonly reason: string
    }
  | {
      readonly status: "error"
      readonly name: typeof LFG_STABLE_PLUGIN_NAME
      readonly linkPath: string
      readonly targetPath: string
      readonly error: string
    }

export function stableInstalledPluginPath(): string {
  return join(homedir(), ".grok", "installed-plugins", LFG_STABLE_PLUGIN_NAME)
}

export async function ensureStableLfgPluginLink(adapter: LazycodexAdapter): Promise<StablePluginLink> {
  const linkPath = stableInstalledPluginPath()
  if (!adapter.found) return { status: "missing_adapter", name: LFG_STABLE_PLUGIN_NAME, linkPath }

  const targetPath = resolve(adapter.root)
  try {
    await mkdir(dirname(linkPath), { recursive: true })
    const current = await readExistingLink(linkPath)
    if (current.status === "directory_or_file") {
      return {
        status: "conflict",
        name: LFG_STABLE_PLUGIN_NAME,
        linkPath,
        targetPath,
        reason: "Refusing to replace an existing non-symlink lfg installed-plugin entry.",
      }
    }
    if (current.status === "symlink") {
      if (resolve(dirname(linkPath), current.target) === targetPath) return { status: "linked", name: LFG_STABLE_PLUGIN_NAME, linkPath, targetPath }
      await unlink(linkPath)
    }
    await symlink(targetPath, linkPath, process.platform === "win32" ? "junction" : "dir")
    return { status: "linked", name: LFG_STABLE_PLUGIN_NAME, linkPath, targetPath }
  } catch (error) {
    return { status: "error", name: LFG_STABLE_PLUGIN_NAME, linkPath, targetPath, error: error instanceof Error ? error.message : String(error) }
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
