import { cp, mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"

export type GrokInstallResult = {
  readonly ok: true
  readonly pluginRoot: string
  readonly installStampPath: string
  readonly version: string
}

export type GrokInstallOptions = {
  readonly home: string
  readonly sourceRoot: string
  readonly pluginDirName?: string
  readonly version?: string
}

const DEFAULT_PLUGIN_DIR = "lazycodex"
const DEFAULT_VERSION = "0.0.0-dev"

export async function installGrokPluginFromSource(options: GrokInstallOptions): Promise<GrokInstallResult> {
  const pluginDirName = options.pluginDirName ?? DEFAULT_PLUGIN_DIR
  const version = options.version ?? DEFAULT_VERSION
  const pluginRoot = join(options.home, ".grok", "installed-plugins", pluginDirName)
  await mkdir(join(options.home, ".grok", "installed-plugins"), { recursive: true })
  await cp(options.sourceRoot, pluginRoot, { recursive: true, force: true })
  const installStampPath = join(pluginRoot, "lfg-install.json")
  const stamp = { packageName: "@islee23520/lfg", version, platform: "grok" as const }
  await writeFile(installStampPath, `${JSON.stringify(stamp, null, 2)}\n`, "utf8")
  return { ok: true, pluginRoot, installStampPath, version }
}

export async function readGrokInstallStamp(pluginRoot: string): Promise<{ readonly packageName: string; readonly version: string } | null> {
  try {
    const parsed = JSON.parse(await readFile(join(pluginRoot, "lfg-install.json"), "utf8")) as unknown
    if (typeof parsed !== "object" || parsed === null) return null
    const record = parsed as Record<string, unknown>
    if (typeof record.packageName !== "string" || typeof record.version !== "string") return null
    return { packageName: record.packageName, version: record.version }
  } catch {
    return null
  }
}