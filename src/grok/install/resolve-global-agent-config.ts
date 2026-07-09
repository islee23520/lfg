import type { LazycodexAgentConfig, ModelDiscovery } from "../../cli/models/lfg-models"
import { defaultLazycodexAgentConfig } from "../../cli/models/lfg-models"
import { readLazycodexAgentsFromGrokConfig } from "../agents/read-lazycodex-agents-from-config"

/** Grok global ledger defaults when no discovery and no config.toml agent sections. */
export const FALLBACK_GLOBAL_LAZYCODEX_AGENTS: LazycodexAgentConfig = {
  explorer: { model: "grok-composer-2.5-fast", reasoningLevel: "low" },
  reasoning: { model: "grok-4.5", reasoningLevel: "high" },
  coding: { model: "grok-composer-2.5-fast", reasoningLevel: "medium" },
}

/**
 * Resolve lazycodex role agents for ~/.grok/agents on every lfg install.
 * Priority: fresh discovery → existing config.toml → static Grok defaults.
 */
export async function resolveGlobalLazycodexAgentConfig(
  home: string,
  discovery: ModelDiscovery | null,
): Promise<LazycodexAgentConfig> {
  if (discovery !== null) {
    return discovery.agentConfig ?? defaultLazycodexAgentConfig(discovery)
  }
  const fromConfig = await readLazycodexAgentsFromGrokConfig(home)
  return fromConfig ?? FALLBACK_GLOBAL_LAZYCODEX_AGENTS
}