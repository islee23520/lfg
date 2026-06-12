/** Legacy Codex/LFP fields that must not appear on Grok setup JSON (#21). */
export const DEPRECATED_SETUP_JSON_KEYS = [
    "stablePluginLink",
    "stablePluginLinks",
    "mcpConfigRepair",
    "adapter",
];
export function findDeprecatedSetupJsonKeys(json) {
    return DEPRECATED_SETUP_JSON_KEYS.filter((key) => key in json);
}
export function setupPostInstallConsistent(ok, postInstallVerify) {
    if (!ok) {
        return true;
    }
    return postInstallVerify.ok === true;
}
