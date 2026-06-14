import { defaultLazycodexAgentConfig } from "../bin/lfg-models";
import { readLazycodexAgentsFromGrokConfig } from "./read-lazycodex-agents-from-config";
/** Grok global ledger defaults when no discovery and no config.toml agent sections. */
export const FALLBACK_GLOBAL_LAZYCODEX_AGENTS = {
    explorer: { model: "grok-3-mini-fast", reasoningLevel: "low" },
    reasoning: { model: "grok-4.3", reasoningLevel: "high" },
    coding: { model: "grok-4.20-0309-non-reasoning", reasoningLevel: "medium" },
};
/**
 * Resolve lazycodex role agents for ~/.grok/agents on every lfg install.
 * Priority: fresh discovery → existing config.toml → static Grok defaults.
 */
export async function resolveGlobalLazycodexAgentConfig(home, discovery) {
    if (discovery !== null) {
        return discovery.agentConfig ?? defaultLazycodexAgentConfig(discovery);
    }
    const fromConfig = await readLazycodexAgentsFromGrokConfig(home);
    return fromConfig ?? FALLBACK_GLOBAL_LAZYCODEX_AGENTS;
}
