import { existsSync } from "node:fs"
import { lstat } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import type { JsonObject } from "../cli/lfg-json"
import { mergePortedHooksIntoPlugin } from "./extension-hooks"
import { readAdapterHooksTrust, resolveGrokAdapterPluginRoot } from "./grok-adapter-paths"
import { installGrokPluginFromSource, readGrokInstallStamp } from "./install"
import { readLfgPackageVersionFromBundle } from "./package-version"
import { resolveLazycodexGrokPluginSource } from "./resolve-lazycodex-plugin-source"
import { resolveOmoPayloadSource } from "./resolve-omo-payload-source"
import { ensureCuaDriverSkill, ensureUlwWorkflowSkills } from "./ensure-cua-driver-skill"
import { ensureHephaestusModelGate } from "./ensure-hephaestus-model-gate"
import { writeGrokInstallStamp } from "./write-install-stamp"
import { writeComponentInventory } from "./component-inventory"
import { materializeGrokMcpRuntimes } from "./materialize-grok-mcp"
import { resolveGrokSetupHome } from "./grok-home"

const GROK_PLUGIN_DIR = "lfg" as const

export async function runInternalGrokInstall(env: NodeJS.ProcessEnv = process.env): Promise<JsonObject> {
  const home = resolveGrokSetupHome(env)
  const version =
    env.LFG_PACKAGE_VERSION ??
    (await readLfgPackageVersionFromBundle(import.meta.url)) ??
    "0.0.0-dev"

  // Only do cheap repair (no full re-copy) when we have a healthy, native user plugin
  // directory that we previously installed ourselves under the canonical "lfg" name.
  // Legacy installed-plugins entries are treated as dirty so the next setup migrates them
  // into ~/.grok/plugins/lfg, which Grok discovers natively at session startup.
  const resolved = await resolveGrokAdapterPluginRoot(home)
  const forceReinstall = env.LFG_SETUP_FORCE === "1" || env.LFG_SETUP_FORCE === "true"
  const canRepairCleanly =
    !forceReinstall &&
    resolved !== null &&
    resolved.location === "native_plugins" &&
    resolved.pluginDirName === GROK_PLUGIN_DIR &&
    (await isRealDirectory(resolved.pluginRoot)) &&
    (await readGrokInstallStamp(resolved.pluginRoot)) !== null &&
    (await readAdapterHooksTrust(resolved.pluginRoot)).ok

  if (canRepairCleanly) {
    return finishRepair(resolved.pluginRoot, resolved.pluginDirName, version, "repair_adapter", env)
  }

  const sourceOverride = env.LFG_GROK_INSTALL_SOURCE_ROOT?.trim()
  const omoSource = sourceOverride && sourceOverride.length > 0 ? null : await resolveOmoPayloadSource(env)
  const lazycodexSource = omoSource
    ? null
    : sourceOverride && sourceOverride.length > 0
      ? sourceOverride
      : await resolveLazycodexGrokPluginSource(env)
  const pluginSource = omoSource?.sourcePath ?? lazycodexSource

  if (pluginSource) {
    const mode = sourceOverride ? "source_override" : omoSource ? "omo_native_bundle" : "lazycodex_bundle"
    const payloadDescription = omoSource?.payloadDescription ?? lazycodexSource ?? sourceOverride ?? pluginSource
    const result = await installGrokPluginFromSource({
      home,
      sourceRoot: pluginSource,
      version,
      pluginDirName: GROK_PLUGIN_DIR,
      componentInventorySource: mode,
    })
    const hooks = await mergePortedHooksIntoPlugin(result.pluginRoot)
    await ensureCuaDriverSkill(result.pluginRoot)
    await ensureUlwWorkflowSkills(result.pluginRoot)
    await ensureHephaestusModelGate(result.pluginRoot)
    return {
      ok: true,
      status: "installed",
      step: "internal_grok_install",
      packageName: "lfg-grok-install",
      mode,
      pluginRoot: result.pluginRoot,
      pluginDirName: GROK_PLUGIN_DIR,
      installStampPath: result.installStampPath,
      componentInventoryPath: result.componentInventoryPath,
      version: result.version,
      exitCode: 0,
      stdout: `${omoSource ? "grok omo install" : "grok lazycodex install"} -> ${result.pluginRoot} from ${payloadDescription} events=${hooks.hookNames.join(",")} cua-driver-skill=ensured`,
      stderr: "",
    }
  }

  const result = await installGrokPluginFromSource({
    home,
    sourceRoot: defaultFixtureSourceRoot(),
    version,
    pluginDirName: GROK_PLUGIN_DIR,
    componentInventorySource: "fixture_fallback",
  })
  const hooks = await mergePortedHooksIntoPlugin(result.pluginRoot)
  await ensureCuaDriverSkill(result.pluginRoot)
  await ensureUlwWorkflowSkills(result.pluginRoot)
  await ensureHephaestusModelGate(result.pluginRoot)
  return {
    ok: true,
    status: "installed",
    step: "internal_grok_install",
    packageName: "lfg-grok-install",
    mode: "fixture_fallback",
    pluginRoot: result.pluginRoot,
    pluginDirName: GROK_PLUGIN_DIR,
    installStampPath: result.installStampPath,
    componentInventoryPath: result.componentInventoryPath,
    version: result.version,
    exitCode: 0,
    stdout: `fixture fallback -> ${result.pluginRoot} events=${hooks.hookNames.join(",")} cua-driver-skill=ensured`,
    stderr: "",
    warning:
      "Full OMO/lazycodex tree not found. Set LFG_OMO_PLUGIN_SOURCE or LFG_LAZYCODEX_PLUGIN_SOURCE, then re-run lfg setup --run.",
  }
}

async function finishRepair(
  pluginRoot: string,
  pluginDirName: string,
  version: string,
  mode: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<JsonObject> {
  const lazycodexSource = await resolveLazycodexGrokPluginSource(env)
  if (lazycodexSource) {
    await materializeGrokMcpRuntimes(pluginRoot, lazycodexSource)
  }
  const hooks = await mergePortedHooksIntoPlugin(pluginRoot)
  await ensureCuaDriverSkill(pluginRoot)
  await ensureUlwWorkflowSkills(pluginRoot)
  await ensureHephaestusModelGate(pluginRoot)
  const installStampPath = await writeGrokInstallStamp(pluginRoot, version)
  const componentInventoryPath = await writeComponentInventory({ pluginRoot, packageVersion: version, source: "repair_adapter" })
  return {
    ok: true,
    status: "installed",
    step: "internal_grok_install",
    packageName: "lfg-grok-install",
    mode,
    pluginRoot,
    pluginDirName,
    installStampPath,
    componentInventoryPath,
    version,
    exitCode: 0,
    stdout: `repaired adapter hooks at ${pluginRoot} events=${hooks.hookNames.join(",")} cua-driver-skill=ensured`,
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
