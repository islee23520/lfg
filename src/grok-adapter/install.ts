import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { writeComponentInventory, type ComponentInventorySource } from "./component-inventory"
import { materializeGrokMcpRuntimes } from "./materialize-grok-mcp"

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

/**
 * MCP component directories whose upstream CLIs import packages that are not
 * installed in the plugin tree (e.g. `@code-yeongyu/lsp-daemon`). The lfg-owned
 * shims from the bundled `grok-install/components/` tree replace them so hook
 * subcommands exit gracefully instead of crashing on import resolution.
 */
const LFG_COMPONENT_SHIM_DIRS = ["ast-grep", "git-bash", "lsp"] as const

export function nativeGrokPluginRoot(home: string, pluginDirName: string = DEFAULT_PLUGIN_DIR): string {
  return join(home, ".grok", "plugins", pluginDirName)
}

export function legacyInstalledGrokPluginRoot(home: string, pluginDirName: string = DEFAULT_PLUGIN_DIR): string {
  return join(home, ".grok", "installed-plugins", pluginDirName)
}

export async function installGrokPluginFromSource(options: GrokInstallOptions): Promise<GrokInstallResult> {
  const pluginDirName = options.pluginDirName ?? DEFAULT_PLUGIN_DIR
  const version = options.version ?? DEFAULT_VERSION
  const pluginRoot = nativeGrokPluginRoot(options.home, pluginDirName)
  const legacyPluginRoot = legacyInstalledGrokPluginRoot(options.home, pluginDirName)

  // Always materialize a real user plugin directory owned by lfg under ~/.grok/plugins.
  // Grok discovers this location natively at session startup; the older installed-plugins
  // adapter target is removed to avoid duplicate/stale hook registries.
  await mkdir(join(options.home, ".grok", "plugins"), { recursive: true })
  await rm(pluginRoot, { recursive: true, force: true })
  await rm(legacyPluginRoot, { recursive: true, force: true })

  await cp(options.sourceRoot, pluginRoot, { recursive: true, force: true })
  await overlayLfgComponentShims(pluginRoot)
  await writeLfgPluginPackageManifest(pluginRoot, version)
  const installStampPath = join(pluginRoot, "lfg-install.json")
  const stamp = { packageName: "@islee23520/lfg", version, platform: "grok" as const }
  await writeFile(installStampPath, `${JSON.stringify(stamp, null, 2)}\n`, "utf8")
  const componentInventoryPath = await writeComponentInventory({
    pluginRoot,
    packageVersion: version,
    source: options.componentInventorySource ?? "source_tree",
  })
  await materializeGrokMcpRuntimes(pluginRoot, options.sourceRoot)
  return { ok: true, pluginRoot, installStampPath, componentInventoryPath, version }
}

async function writeLfgPluginPackageManifest(pluginRoot: string, version: string): Promise<void> {
  const manifest = {
    name: "LFG",
    version,
    description: "LFG Grok Build adapter payload.",
    private: true,
    type: "module",
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

/**
 * Resolves the bundled lfg-owned component shim directory relative to the
 * current module. In the esbuild bundle this is `dist/grok-install/components/`.
 * Returns null when the shims are not bundled (e.g. running from source without
 * a build).
 */
function resolveBundledComponentShimsRoot(): string | null {
  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    join(here, "grok-install", "components"),
    join(here, "..", "grok-install", "components"),
  ]
  for (const path of candidates) {
    if (existsSync(join(path, "lsp", "dist", "cli.js"))) return path
  }
  return null
}

/**
 * Overwrites the three MCP component directories (ast-grep, git-bash, lsp) in
 * the installed plugin tree with the lfg-owned shims from the bundle. This
 * prevents upstream component CLIs from crashing on missing package imports
 * (e.g. `@code-yeongyu/lsp-daemon`) when hooks invoke them.
 */
export async function overlayLfgComponentShims(pluginRoot: string): Promise<void> {
  const shimsRoot = resolveBundledComponentShimsRoot()
  if (shimsRoot === null) return
  for (const dir of LFG_COMPONENT_SHIM_DIRS) {
    const src = join(shimsRoot, dir)
    if (!existsSync(src)) continue
    const dst = join(pluginRoot, "components", dir)
    await rm(dst, { recursive: true, force: true })
    await cp(src, dst, { recursive: true })
  }
}
