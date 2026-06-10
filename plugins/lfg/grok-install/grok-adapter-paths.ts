import { access, readFile } from "node:fs/promises"
import { join } from "node:path"
import { isGrokEventHooksJson, validateGrokHooksJson } from "./hook-trust"

export const GROK_ADAPTER_PLUGIN_DIR_CANDIDATES = ["lfg", "lazycodex"] as const

export type ResolvedGrokAdapter = {
  readonly pluginDirName: (typeof GROK_ADAPTER_PLUGIN_DIR_CANDIDATES)[number]
  readonly pluginRoot: string
}

/** Prefer lazycodex-ai install tree (`lfg`) over legacy internal copy dir (`lazycodex`). */
export async function resolveGrokAdapterPluginRoot(home: string): Promise<ResolvedGrokAdapter | null> {
  for (const pluginDirName of GROK_ADAPTER_PLUGIN_DIR_CANDIDATES) {
    const pluginRoot = join(home, ".grok", "installed-plugins", pluginDirName)
    if (!(await pathExists(pluginRoot))) {
      continue
    }
    if (await looksLikeLazycodexAdapterTree(pluginRoot)) {
      return { pluginDirName, pluginRoot }
    }
  }
  return null
}

async function looksLikeLazycodexAdapterTree(pluginRoot: string): Promise<boolean> {
  if (await pathExists(join(pluginRoot, "components"))) {
    return true
  }
  if (await pathExists(join(pluginRoot, "lfg-install.json"))) {
    return true
  }
  const hooksPath = join(pluginRoot, "hooks", "hooks.json")
  if (!(await pathExists(hooksPath))) {
    return false
  }
  try {
    const parsed: unknown = JSON.parse(await readFile(hooksPath, "utf8"))
    return isGrokEventHooksJson(parsed)
  } catch {
    return false
  }
}

export async function readAdapterHooksTrust(pluginRoot: string): Promise<ReturnType<typeof validateGrokHooksJson>> {
  const hooksPath = join(pluginRoot, "hooks", "hooks.json")
  if (!(await pathExists(hooksPath))) {
    return { ok: false, hookNames: [], error: "hooks.json missing" }
  }
  try {
    const parsed: unknown = JSON.parse(await readFile(hooksPath, "utf8"))
    return validateGrokHooksJson(parsed)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, hookNames: [], error: message }
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}