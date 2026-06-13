import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { isGrokEventHooksJson, validateGrokHooksJson } from "./hook-trust";
import { legacyInstalledGrokPluginRoot, nativeGrokPluginRoot } from "./install";
export const GROK_ADAPTER_PLUGIN_DIR_CANDIDATES = ["lfg", "lazycodex"];
/** Prefer native ~/.grok/plugins/lfg, then legacy ~/.grok/installed-plugins fallback. */
export async function resolveGrokAdapterPluginRoot(home) {
    for (const location of ["native_plugins", "legacy_installed_plugins"]) {
        for (const pluginDirName of GROK_ADAPTER_PLUGIN_DIR_CANDIDATES) {
            const pluginRoot = location === "native_plugins"
                ? nativeGrokPluginRoot(home, pluginDirName)
                : legacyInstalledGrokPluginRoot(home, pluginDirName);
            if (!(await pathExists(pluginRoot))) {
                continue;
            }
            if (await looksLikeLazycodexAdapterTree(pluginRoot)) {
                return { pluginDirName, pluginRoot, location };
            }
        }
    }
    return null;
}
async function looksLikeLazycodexAdapterTree(pluginRoot) {
    if (await pathExists(join(pluginRoot, "components"))) {
        return true;
    }
    if (await pathExists(join(pluginRoot, "lfg-install.json"))) {
        return true;
    }
    const hooksPath = join(pluginRoot, "hooks", "hooks.json");
    if (!(await pathExists(hooksPath))) {
        return false;
    }
    try {
        const parsed = JSON.parse(await readFile(hooksPath, "utf8"));
        return isGrokEventHooksJson(parsed);
    }
    catch {
        return false;
    }
}
export async function readAdapterHooksTrust(pluginRoot) {
    const hooksPath = join(pluginRoot, "hooks", "hooks.json");
    if (!(await pathExists(hooksPath))) {
        return { ok: false, hookNames: [], error: "hooks.json missing" };
    }
    try {
        const parsed = JSON.parse(await readFile(hooksPath, "utf8"));
        return validateGrokHooksJson(parsed);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { ok: false, hookNames: [], error: message };
    }
}
async function pathExists(path) {
    try {
        await access(path);
        return true;
    }
    catch {
        return false;
    }
}
