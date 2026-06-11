import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { writeComponentInventory, type ComponentInventorySource } from "./component-inventory"

export type GrokInstallResult = {
  readonly ok: true
  readonly pluginRoot: string
  readonly installStampPath: string
  readonly componentInventoryPath: string
  readonly version: string
}

export type GrokInstallOptions = {
  readonly home: string
  readonly sourceRoot: string
  readonly pluginDirName?: string
  readonly version?: string
  readonly componentInventorySource?: ComponentInventorySource
}

const DEFAULT_PLUGIN_DIR = "lfg"
const DEFAULT_VERSION = "0.0.0-dev"

export async function installGrokPluginFromSource(options: GrokInstallOptions): Promise<GrokInstallResult> {
  const pluginDirName = options.pluginDirName ?? DEFAULT_PLUGIN_DIR
  const version = options.version ?? DEFAULT_VERSION
  const pluginRoot = join(options.home, ".grok", "installed-plugins", pluginDirName)

  // Always materialize a real directory owned by lfg under ~/.grok.
  // Remove whatever is there (including symlinks pointing into ~/.codex or legacy locations)
  // so that lazycodex/omo features are installed separately and directly into Grok.
  await mkdir(join(options.home, ".grok", "installed-plugins"), { recursive: true })
  try {
    await rm(pluginRoot, { recursive: true, force: true })
  } catch {
    // ignore if not present
  }

  await cp(options.sourceRoot, pluginRoot, { recursive: true, force: true })
  await writeLfgPluginPackageManifest(pluginRoot, version)
  const installStampPath = join(pluginRoot, "lfg-install.json")
  const stamp = { packageName: "@islee23520/lfg", version, platform: "grok" as const }
  await writeFile(installStampPath, `${JSON.stringify(stamp, null, 2)}\n`, "utf8")
  const componentInventoryPath = await writeComponentInventory({
    pluginRoot,
    packageVersion: version,
    source: options.componentInventorySource ?? "source_tree",
  })
  return { ok: true, pluginRoot, installStampPath, componentInventoryPath, version }
}

async function writeLfgPluginPackageManifest(pluginRoot: string, version: string): Promise<void> {
  const manifest = {
    name: "LFG",
    version,
    description: "LFG Grok Build adapter payload.",
    private: true,
  }
  await writeFile(join(pluginRoot, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8")
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
