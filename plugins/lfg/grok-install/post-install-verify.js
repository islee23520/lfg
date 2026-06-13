import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { legacyInstalledGrokPluginRoot, nativeGrokPluginRoot, readGrokInstallStamp } from "./install";
import { readAdapterHooksTrust, resolveGrokAdapterPluginRoot } from "./grok-adapter-paths";
import { componentInventoryPath } from "./component-inventory";
/** Same resolution as doctor: adapter under ~/.grok/installed-plugins/lfg or lazycodex. */
export async function verifyGrokInstallSurface(options) {
    const resolved = options.pluginDirName === undefined
        ? await resolveGrokAdapterPluginRoot(options.home)
        : await resolveFixedPlugin(options.home, options.pluginDirName);
    if (resolved === null) {
        const pluginDirName = options.pluginDirName ?? "lfg";
        const pluginRoot = join(options.home, ".grok", "installed-plugins", pluginDirName);
        return {
            ok: false,
            status: "missing_adapter",
            pluginDirName,
            pluginRoot,
            stamp: null,
            hooksPath: null,
            hooksRegistered: false,
            hookNames: [],
            hookTrustError: "adapter plugin tree not found",
            componentInventoryPath: null,
            payloadSource: null,
        };
    }
    const { pluginRoot, pluginDirName } = resolved;
    const stamp = await readGrokInstallStamp(pluginRoot);
    const hooksPath = join(pluginRoot, "hooks", "hooks.json");
    const hookTrust = await readAdapterHooksTrust(pluginRoot);
    const hooksOk = hookTrust.ok;
    const ok = stamp !== null && hooksOk;
    const invPath = componentInventoryPath(pluginRoot);
    const payloadSource = await readPayloadSource(invPath);
    return {
        ok,
        status: ok ? "verified" : "missing_adapter",
        pluginDirName,
        pluginRoot,
        stamp,
        hooksPath,
        hooksRegistered: hooksOk,
        hookNames: hookTrust.hookNames,
        hookTrustError: hookTrust.error,
        componentInventoryPath: invPath,
        payloadSource,
    };
}
async function readPayloadSource(path) {
    try {
        const raw = await readFile(path, "utf8");
        const parsed = JSON.parse(raw);
        const s = parsed?.source;
        if (typeof s === "string" && (s === "source_tree" || s === "source_override" || s === "lazycodex_bundle" || s === "fixture_fallback" || s === "repair_adapter")) {
            return s;
        }
        return null;
    }
    catch {
        return null;
    }
}
async function resolveFixedPlugin(home, pluginDirName) {
    for (const pluginRoot of [nativeGrokPluginRoot(home, pluginDirName), legacyInstalledGrokPluginRoot(home, pluginDirName)]) {
        const hookTrust = await readAdapterHooksTrust(pluginRoot);
        if (!hookTrust.ok && hookTrust.error === "hooks.json missing") {
            try {
                await readFile(join(pluginRoot, "lfg-install.json"), "utf8");
                return { pluginDirName, pluginRoot };
            }
            catch {
                continue;
            }
        }
        if (hookTrust.ok || (await readGrokInstallStamp(pluginRoot)) !== null) {
            return { pluginDirName, pluginRoot };
        }
    }
    return (await resolveGrokAdapterPluginRoot(home)) ?? null;
}
