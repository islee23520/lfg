import { existsSync } from "node:fs";
import { lstat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mergePortedHooksIntoPlugin } from "./extension-hooks";
import { readAdapterHooksTrust, resolveGrokAdapterPluginRoot } from "./grok-adapter-paths";
import { installGrokPluginFromSource, readGrokInstallStamp } from "./install";
import { readLfgPackageVersionFromBundle } from "./package-version";
import { resolveLazycodexGrokPluginSource } from "./resolve-lazycodex-plugin-source";
import { ensureCuaDriverSkill } from "./ensure-cua-driver-skill";
import { ensureHephaestusModelGate } from "./ensure-hephaestus-model-gate";
import { writeGrokInstallStamp } from "./write-install-stamp";
import { writeComponentInventory } from "./component-inventory";
import { materializeGrokMcpRuntimes } from "./materialize-grok-mcp";
const GROK_PLUGIN_DIR = "lfg";
async function runInternalGrokInstall(env = process.env) {
  const home = env.HOME ?? homedir();
  const version = env.LFG_PACKAGE_VERSION ?? await readLfgPackageVersionFromBundle(import.meta.url) ?? "0.0.0-dev";
  const resolved = await resolveGrokAdapterPluginRoot(home);
  const forceReinstall = env.LFG_SETUP_FORCE === "1" || env.LFG_SETUP_FORCE === "true";
  const canRepairCleanly = !forceReinstall && resolved !== null && resolved.location === "native_plugins" && resolved.pluginDirName === GROK_PLUGIN_DIR && await isRealDirectory(resolved.pluginRoot) && await readGrokInstallStamp(resolved.pluginRoot) !== null && (await readAdapterHooksTrust(resolved.pluginRoot)).ok;
  if (canRepairCleanly) {
    return finishRepair(resolved.pluginRoot, resolved.pluginDirName, version, "repair_adapter", env);
  }
  const sourceOverride = env.LFG_GROK_INSTALL_SOURCE_ROOT?.trim();
  const lazycodexSource = sourceOverride && sourceOverride.length > 0 ? sourceOverride : await resolveLazycodexGrokPluginSource(env);
  if (lazycodexSource) {
    const mode = sourceOverride ? "source_override" : "lazycodex_bundle";
    const result2 = await installGrokPluginFromSource({
      home,
      sourceRoot: lazycodexSource,
      version,
      pluginDirName: GROK_PLUGIN_DIR,
      componentInventorySource: mode
    });
    const hooks2 = await mergePortedHooksIntoPlugin(result2.pluginRoot);
    await ensureCuaDriverSkill(result2.pluginRoot);
    await ensureHephaestusModelGate(result2.pluginRoot);
    return {
      ok: true,
      status: "installed",
      step: "internal_grok_install",
      packageName: "lfg-grok-install",
      mode,
      pluginRoot: result2.pluginRoot,
      pluginDirName: GROK_PLUGIN_DIR,
      installStampPath: result2.installStampPath,
      componentInventoryPath: result2.componentInventoryPath,
      version: result2.version,
      exitCode: 0,
      stdout: `grok lazycodex install -> ${result2.pluginRoot} from ${lazycodexSource} events=${hooks2.hookNames.join(",")} cua-driver-skill=ensured`,
      stderr: ""
    };
  }
  const result = await installGrokPluginFromSource({
    home,
    sourceRoot: defaultFixtureSourceRoot(),
    version,
    pluginDirName: GROK_PLUGIN_DIR,
    componentInventorySource: "fixture_fallback"
  });
  const hooks = await mergePortedHooksIntoPlugin(result.pluginRoot);
  await ensureCuaDriverSkill(result.pluginRoot);
  await ensureHephaestusModelGate(result.pluginRoot);
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
    warning: "Full lazycodex tree not found. Set LFG_LAZYCODEX_PLUGIN_SOURCE or run `npx lazycodex-ai` once to populate npm cache, then re-run lfg setup --run."
  };
}
async function finishRepair(pluginRoot, pluginDirName, version, mode, env = process.env) {
  const lazycodexSource = await resolveLazycodexGrokPluginSource(env);
  if (lazycodexSource) {
    await materializeGrokMcpRuntimes(pluginRoot, lazycodexSource);
  }
  const hooks = await mergePortedHooksIntoPlugin(pluginRoot);
  await ensureCuaDriverSkill(pluginRoot);
  await ensureHephaestusModelGate(pluginRoot);
  const installStampPath = await writeGrokInstallStamp(pluginRoot, version);
  const componentInventoryPath = await writeComponentInventory({ pluginRoot, packageVersion: version, source: "repair_adapter" });
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
    stderr: ""
  };
}
function defaultFixtureSourceRoot() {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, "grok-install", "fixture-minimal"),
    join(here, "fixture-minimal"),
    join(here, "..", "grok-install", "fixture-minimal")
  ];
  for (const path of candidates) {
    if (existsSync(path)) {
      return path;
    }
  }
  return candidates[1];
}
async function isRealDirectory(path) {
  try {
    const st = await lstat(path);
    return st.isDirectory() && !st.isSymbolicLink();
  } catch {
    return false;
  }
}
export {
  runInternalGrokInstall
};
