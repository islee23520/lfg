import { access, readdir } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"

const RELATIVE_PLUGIN_ROOT = join("packages", "omo-codex", "plugin")

/**
 * OMO lazycodex aggregate plugin tree (skills, components, ultrawork agents) without running Codex install.
 * Sources: LFG_LAZYCODEX_PLUGIN_SOURCE → ~/.npm/_npx/.../lazycodex-ai/.../plugin
 */
export async function resolveLazycodexGrokPluginSource(env: NodeJS.ProcessEnv = process.env): Promise<string | null> {
  const explicit = env.LFG_LAZYCODEX_PLUGIN_SOURCE?.trim()
  if (explicit && (await isInstallablePluginTree(explicit))) {
    return explicit
  }
  const home = env.HOME ?? homedir()
  return findLazycodexPluginInNpxCache(home)
}

async function findLazycodexPluginInNpxCache(home: string): Promise<string | null> {
  const npxRoot = join(home, ".npm", "_npx")
  let entries: string[]
  try {
    entries = await readdir(npxRoot)
  } catch {
    return null
  }
  const candidates: string[] = []
  for (const entry of entries) {
    const lazycodexRoot = join(npxRoot, entry, "node_modules", "lazycodex-ai")
    candidates.push(join(lazycodexRoot, RELATIVE_PLUGIN_ROOT))
  }
  candidates.sort((a, b) => b.localeCompare(a))
  for (const path of candidates) {
    if (await isInstallablePluginTree(path)) {
      return path
    }
  }
  return null
}

async function isInstallablePluginTree(root: string): Promise<boolean> {
  try {
    await access(join(root, "components", "ultrawork", "agents"))
    return true
  } catch {
    try {
      await access(join(root, "hooks", "hooks.json"))
      return true
    } catch {
      return false
    }
  }
}