import { access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const BRIDGE_FILE = "lfg-grok-hook-bridge.mjs";
/** Resolve bridge script path for bundled CLI (dist/lfg.js) and source grok-install modules. */
export async function resolveGrokHookBridgeAssetPath(moduleUrl = import.meta.url) {
    const here = dirname(toFilePath(moduleUrl));
    const candidates = [
        join(here, "grok-install", "assets", BRIDGE_FILE),
        join(here, "assets", BRIDGE_FILE),
        join(here, "..", "grok-install", "assets", BRIDGE_FILE),
        join(here, "..", "..", "grok-install", "assets", BRIDGE_FILE),
    ];
    for (const path of candidates) {
        if (await pathExists(path)) {
            return path;
        }
    }
    throw new Error(`grok hook bridge asset not found (searched from ${here})`);
}
function toFilePath(moduleUrl) {
    if (moduleUrl.startsWith("file://")) {
        return fileURLToPath(moduleUrl);
    }
    return moduleUrl;
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
