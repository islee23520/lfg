import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { writeComponentInventory } from "./component-inventory";
const DEFAULT_PLUGIN_DIR = "lfg";
const DEFAULT_VERSION = "0.0.0-dev";
export function nativeGrokPluginRoot(home, pluginDirName = DEFAULT_PLUGIN_DIR) {
    return join(home, ".grok", "plugins", pluginDirName);
}
export function legacyInstalledGrokPluginRoot(home, pluginDirName = DEFAULT_PLUGIN_DIR) {
    return join(home, ".grok", "installed-plugins", pluginDirName);
}
export async function installGrokPluginFromSource(options) {
    const pluginDirName = options.pluginDirName ?? DEFAULT_PLUGIN_DIR;
    const version = options.version ?? DEFAULT_VERSION;
    const pluginRoot = nativeGrokPluginRoot(options.home, pluginDirName);
    const legacyPluginRoot = legacyInstalledGrokPluginRoot(options.home, pluginDirName);
    // Always materialize a real user plugin directory owned by lfg under ~/.grok/plugins.
    // Grok discovers this location natively at session startup; the older installed-plugins
    // adapter target is removed to avoid duplicate/stale hook registries.
    await mkdir(join(options.home, ".grok", "plugins"), { recursive: true });
    await rm(pluginRoot, { recursive: true, force: true });
    await rm(legacyPluginRoot, { recursive: true, force: true });
    await cp(options.sourceRoot, pluginRoot, { recursive: true, force: true });
    await writeLfgPluginPackageManifest(pluginRoot, version);
    const installStampPath = join(pluginRoot, "lfg-install.json");
    const stamp = { packageName: "@islee23520/lfg", version, platform: "grok" };
    await writeFile(installStampPath, `${JSON.stringify(stamp, null, 2)}\n`, "utf8");
    const componentInventoryPath = await writeComponentInventory({
        pluginRoot,
        packageVersion: version,
        source: options.componentInventorySource ?? "source_tree",
    });
    return { ok: true, pluginRoot, installStampPath, componentInventoryPath, version };
}
async function writeLfgPluginPackageManifest(pluginRoot, version) {
    const manifest = {
        name: "LFG",
        version,
        description: "LFG Grok Build adapter payload.",
        private: true,
    };
    await writeFile(join(pluginRoot, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}
export async function readGrokInstallStamp(pluginRoot) {
    try {
        const parsed = JSON.parse(await readFile(join(pluginRoot, "lfg-install.json"), "utf8"));
        if (typeof parsed !== "object" || parsed === null)
            return null;
        const record = parsed;
        if (typeof record.packageName !== "string" || typeof record.version !== "string")
            return null;
        return { packageName: record.packageName, version: record.version };
    }
    catch {
        return null;
    }
}
