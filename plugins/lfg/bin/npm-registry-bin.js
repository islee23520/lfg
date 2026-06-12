import { isPublishedLfgBinTarget } from "./npm-publish-bin";
/** Values seen on broken registry publishes (#22). */
export const LEGACY_REGISTRY_BIN_LFG_TARGETS = [
    "plugins/lfg/dist/lfg.js",
    "dist/lfg.js",
];
/** Parse `npm view <pkg> bin.lfg` stdout (#22). */
export function parseNpmRegistryBinLfg(stdout) {
    const trimmed = stdout.trim();
    if (trimmed.length === 0 || trimmed === "undefined" || trimmed === "null") {
        return null;
    }
    return trimmed;
}
export function isLegacyRegistryBinLfg(binLfg) {
    if (binLfg === undefined || binLfg === null || binLfg === "") {
        return false;
    }
    return LEGACY_REGISTRY_BIN_LFG_TARGETS.includes(binLfg);
}
export function registryBinPublishContract(binLfg) {
    return {
        binLfg,
        matchesPublishContract: binLfg !== null && isPublishedLfgBinTarget(binLfg),
        legacyWrongTarget: isLegacyRegistryBinLfg(binLfg),
    };
}
