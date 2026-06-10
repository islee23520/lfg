import { existsSync } from "node:fs"
import { lstat } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import type { JsonObject } from "../bin/lfg-json"
import { mergePortedHooksIntoPlugin } from "./extension-hooks"
import { resolveGrokAdapterPluginRoot } from "./grok-adapter-paths"
import { installGrokPluginFromSource, readGrokInstallStamp } from "./install"
import { readLfgPackageVersionFromBundle } from "./package-version"
import { resolveLazycodexGrokPluginSource } from "./resolve-lazycodex-plugin-source"
import { writeGrokInstallStamp } from "./write-install-stamp"

const GROK_PLUGIN_DIR = "lfg" as const

export async function runInternalGrokInstall(env: NodeJS.ProcessEnv = process.env): Promise<JsonObject> {
  const home = env.HOME ?? homedir()
  const version =
    env.LFG_PACKAGE_VERSION ??
    (await readLfgPackageVersionFromBundle(import.meta.url)) ??
    "0.0.0-dev"

  // Only do cheap repair (no full re-copy) when we have a healthy, real directory
  // that we previously installed ourselves under the canonical "lfg" name.
  // If anything is a symlink (e.g. pointing into ~/.codex), a legacy "lazycodex" name,
  // or lacks our stamp, we treat it as dirty/legacy and proceed to direct install
  // (installGrokPluginFromSource will rm -rf the target first to guarantee a real dir).
  const resolved = await resolveGrokAdapterPluginRoot(home)
  const canRepairCleanly =
    resolved !== null &&
    resolved.pluginDirName === GROK_PLUGIN_DIR &&
    (await isRealDirectory(resolved.pluginRoot)) &&
    (await readGrokInstallStamp(resolved.pluginRoot)) !== null

  if (canRepairCleanly) {
    return finishRepair(resolved.pluginRoot, resolved.pluginDirName, version, "repair_adapter")
  }

  const sourceOverride = env.LFG_GROK_INSTALL_SOURCE_ROOT?.trim()
  const lazycodexSource =
    sourceOverride && sourceOverride.length > 0
      ? sourceOverride
      : await resolveLazycodexGrokPluginSource(env)

  if (lazycodexSource) {
    const mode = sourceOverride ? "source_override" : "lazycodex_bundle"
    const result = await installGrokPluginFromSource({
      home,
      sourceRoot: lazycodexSource,
      version,
      pluginDirName: GROK_PLUGIN_DIR,
    })
    const hooks = await mergePortedHooksIntoPlugin(result.pluginRoot)
    return {
      ok: true,
      status: "installed",
      step: "internal_grok_install",
      packageName: "lfg-grok-install",
      mode,
      pluginRoot: result.pluginRoot,
      pluginDirName: GROK_PLUGIN_DIR,
      installStampPath: result.installStampPath,
      version: result.version,
      exitCode: 0,
      stdout: `grok lazycodex install -> ${result.pluginRoot} from ${lazycodexSource} events=${hooks.hookNames.join(",")}`,
      stderr: "",
    }
  }

  const result = await installGrokPluginFromSource({
    home,
    sourceRoot: defaultFixtureSourceRoot(),
    version,
    pluginDirName: GROK_PLUGIN_DIR,
  })
  const hooks = await mergePortedHooksIntoPlugin(result.pluginRoot)
  return {
    ok: true,
    status: "installed",
    step: "internal_grok_install",
    packageName: "lfg-grok-install",
    mode: "fixture_fallback",
    pluginRoot: result.pluginRoot,
    pluginDirName: GROK_PLUGIN_DIR,
    installStampPath: result.installStampPath,
    version: result.version,
    exitCode: 0,
    stdout: `fixture fallback -> ${result.pluginRoot} events=${hooks.hookNames.join(",")}`,
    stderr: "",
    warning:
      "Full lazycodex tree not found. Set LFG_LAZYCODEX_PLUGIN_SOURCE or run `npx lazycodex-ai` once to populate npm cache, then re-run lfg setup --run.",
  }
}

async function finishRepair(
  pluginRoot: string,
  pluginDirName: string,
  version: string,
  mode: string,
): Promise<JsonObject> {
  const hooks = await mergePortedHooksIntoPlugin(pluginRoot)
  const installStampPath = await writeGrokInstallStamp(pluginRoot, version)
  return {
    ok: true,
    status: "installed",
    step: "internal_grok_install",
    packageName: "lfg-grok-install",
    mode,
    pluginRoot,
    pluginDirName,
    installStampPath,
    version,
    exitCode: 0,
    stdout: `repaired adapter hooks at ${pluginRoot} events=${hooks.hookNames.join(",")}`,
    stderr: "",
  }
}

function defaultFixtureSourceRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    join(here, "grok-install", "fixture-minimal"),
    join(here, "fixture-minimal"),
    join(here, "..", "grok-install", "fixture-minimal"),
  ]
  for (const path of candidates) {
    if (existsSync(path)) {
      return path
    }
  }
  return candidates[1]!
}

/** Returns true only for a real directory (not a symlink, not a file). */
async function isRealDirectory(path: string): Promise<boolean> {
  try {
    const st = await lstat(path)
    return st.isDirectory() && !st.isSymbolicLink()
  } catch {
    return false
  }
}