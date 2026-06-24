import { access, lstat } from "node:fs/promises"
import { readAdapterHooksTrust, resolveGrokAdapterPluginRoot } from "../payload/grok-adapter-paths"
import { readGrokInstallStamp } from "../payload/install"

export type ExistingStampedLfgSetup = {
  readonly pluginRoot: string
}

export async function resolveExistingStampedLfgSetup(home: string): Promise<ExistingStampedLfgSetup | null> {
  const resolved = await resolveGrokAdapterPluginRoot(home)
  const ok =
    resolved?.location === "native_plugins" &&
    resolved.pluginDirName === "lfg" &&
    (await isRealDirectory(resolved.pluginRoot)) &&
    (await readGrokInstallStamp(resolved.pluginRoot)) !== null &&
    (await hasRepairablePayload(resolved.pluginRoot))
  return ok ? { pluginRoot: resolved.pluginRoot } : null
}

async function hasRepairablePayload(pluginRoot: string): Promise<boolean> {
  return (
    (await pathExists(`${pluginRoot}/components`)) ||
    (await pathExists(`${pluginRoot}/hooks/hooks.source.json`)) ||
    (await pathExists(`${pluginRoot}/hooks/hooks.json`)) ||
    (await readAdapterHooksTrust(pluginRoot)).ok
  )
}

async function isRealDirectory(path: string): Promise<boolean> {
  try {
    const stat = await lstat(path)
    return stat.isDirectory() && !stat.isSymbolicLink()
  } catch {
    return false
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
