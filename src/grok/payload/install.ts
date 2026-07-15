import { copyFile, cp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { writeComponentInventory, type ComponentInventorySource } from "./component-inventory"
import { materializeGrokMcpRuntimes } from "../mcp/materialize-grok-mcp"
import {
  cleanupInstallSnapshot,
  createInstallSnapshot,
  restoreInstallSnapshot,
} from "../install/install-transaction"
import {
  commitRuntimePromotion,
  cleanupCommittedRuntimePromotion,
  prepareRuntimePromotion,
  rollbackRuntimePromotion,
  type RuntimeEntry,
} from "../install/runtime-promotion"

const LFG_RUNTIME_ENTRIES: readonly RuntimeEntry[] = [
  { path: ".mcp.json", optional: true },
  { path: "components", optional: true },
  { path: "hooks", optional: true },
  { path: "skills", optional: true },
  { path: "package.json", optional: true },
  { path: "assets", optional: true },
  { path: "flavour", optional: true },
  { path: "mcp-runtimes", optional: true },
  { path: "agents", optional: true },
  { path: "prompts", optional: true },
]

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
const LFG_MCP_COMPONENT_SHIM_DIRS = ["ast-grep", "git-bash", "lsp", "eval"] as const
const LFG_HOOK_RUNTIME_COMPONENT_DIRS = ["rules", "ultrawork"] as const

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
  const configPath = join(options.home, ".grok", "config.toml")
  const marketplaceManifestPath = join(pluginRoot, "package.json")

  await mkdir(join(options.home, ".grok", "plugins"), { recursive: true })

  const snapshot = createInstallSnapshot({
    configPath,
    additionalAgentFiles: [],
    marketplaceManifestPath,
  })
  const promotion = prepareRuntimePromotion(options.sourceRoot, pluginRoot, LFG_RUNTIME_ENTRIES)

  try {
    await rm(legacyPluginRoot, { recursive: true, force: true })
    commitRuntimePromotion(promotion)
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
    cleanupCommittedRuntimePromotion(promotion)
    cleanupInstallSnapshot(snapshot)
    return { ok: true, pluginRoot, installStampPath, componentInventoryPath, version }
  } catch (error) {
    rollbackRuntimePromotion(promotion)
    restoreInstallSnapshot(snapshot)
    cleanupInstallSnapshot(snapshot)
    throw error
  }
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
 * Overwrites lfg-owned MCP shims and behavioral hook runtimes in the installed
 * plugin tree. This prevents upstream MCP CLIs from crashing on missing
 * package imports and upgrades stale rules/ultrawork fixture CLIs on repair.
 */
export async function overlayLfgComponentShims(pluginRoot: string, bundledComponentsRoot?: string): Promise<void> {
  const shimsRoot = bundledComponentsRoot ?? resolveBundledComponentShimsRoot()
  if (shimsRoot === null) return
  assertBundledHookRuntimes(shimsRoot)
  for (const dir of LFG_MCP_COMPONENT_SHIM_DIRS) {
    const src = join(shimsRoot, dir)
    if (!existsSync(src)) continue
    const dst = join(pluginRoot, "components", dir)
    await rm(dst, { recursive: true, force: true })
    await cp(src, dst, { recursive: true })
  }
  for (const dir of LFG_HOOK_RUNTIME_COMPONENT_DIRS) {
    await replaceHookRuntimeCli(shimsRoot, pluginRoot, dir)
  }
  // Always ensure the plugin root declares ESM so .mjs hooks and bridge are executed correctly.
  await ensureLfgPluginPackageManifest(pluginRoot)
}

function assertBundledHookRuntimes(componentsRoot: string): void {
  for (const dir of LFG_HOOK_RUNTIME_COMPONENT_DIRS) {
    if (!existsSync(join(componentsRoot, dir, "dist", "cli.js"))) {
      throw new Error(`bundled Grok hook runtime missing: components/${dir}/dist/cli.js`)
    }
  }
}

async function replaceHookRuntimeCli(componentsRoot: string, pluginRoot: string, dir: typeof LFG_HOOK_RUNTIME_COMPONENT_DIRS[number]): Promise<void> {
  const source = join(componentsRoot, dir, "dist", "cli.js")
  const destination = join(pluginRoot, "components", dir, "dist", "cli.js")
  const temporary = `${destination}.tmp-${process.pid}-${Date.now()}`
  await mkdir(dirname(destination), { recursive: true })
  try {
    await copyFile(source, temporary)
    await rename(temporary, destination)
  } finally {
    await rm(temporary, { force: true })
  }
}

export async function ensureLfgPluginPackageManifest(pluginRoot: string): Promise<void> {
  const manifestPath = join(pluginRoot, "package.json")
  let existing: any = null
  try {
    existing = JSON.parse(await readFile(manifestPath, "utf8"))
  } catch {
    existing = {}
  }
  const next = {
    name: existing?.name ?? "LFG",
    version: existing?.version ?? "0.0.0-dev",
    description: existing?.description ?? "LFG Grok Build adapter payload.",
    private: true,
    ...(existing || {}),
    type: "module",
  }
  await writeFile(manifestPath, `${JSON.stringify(next, null, 2)}\n`, "utf8")
}
