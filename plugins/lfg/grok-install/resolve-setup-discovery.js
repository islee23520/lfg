import { fetchModelDiscovery } from "../bin/lfg-models";
import { readGrokModelsBaseUrlFromConfig } from "./read-grok-models-base-url";
export const DEFAULT_SETUP_MODELS_BASE_URL = "http://127.0.0.1:8317/v1";
/**
 * Resolve model discovery for setup without manual URL entry when possible.
 * Priority: --base-url → LFG_GROK_BASE_URL / LAZYCODEX_OPENAI_BASE_URL → config.toml → local proxy default.
 */
export async function resolveSetupDiscovery(options) {
    const envUrl = trimUrl(options.envBaseUrl ?? process.env.LFG_GROK_BASE_URL ?? process.env.LAZYCODEX_OPENAI_BASE_URL);
    const configUrl = await readGrokModelsBaseUrlFromConfig(options.home);
    const skipDefaultProxy = process.env.LFG_DISABLE_DEFAULT_MODELS_PROXY === "1" ||
        process.env.LFG_DISABLE_DEFAULT_MODELS_PROXY === "true";
    const candidates = [
        ...(options.cliBaseUrl ? [{ url: options.cliBaseUrl, source: "cli" }] : []),
        ...(envUrl ? [{ url: envUrl, source: "env" }] : []),
        ...(configUrl ? [{ url: configUrl, source: "config" }] : []),
        ...(skipDefaultProxy ? [] : [{ url: DEFAULT_SETUP_MODELS_BASE_URL, source: "default" }]),
    ];
    const seen = new Set();
    for (const candidate of candidates) {
        const key = candidate.url.trim();
        if (key.length === 0 || seen.has(key)) {
            continue;
        }
        seen.add(key);
        try {
            const discovery = await fetchModelDiscovery(key);
            return {
                discovery,
                baseUrlUsed: key,
                baseUrlSource: candidate.source,
                autoDiscovered: options.cliBaseUrl === null,
            };
        }
        catch {
            continue;
        }
    }
    return { discovery: null, baseUrlUsed: null, baseUrlSource: "none", autoDiscovered: false };
}
function trimUrl(value) {
    const trimmed = value?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : null;
}
