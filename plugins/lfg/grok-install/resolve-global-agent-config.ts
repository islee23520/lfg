import type { LazycodexAgentConfig, ModelDiscovery } from "../bin/lfg-models"
import { defaultLazycodexAgentConfig } from "../bin/lfg-models"
import { readLazycodexAgentsFromGrokConfig } from "./read-lazycodex-agents-from-config"

/** Grok global ledger defaults when no discovery and no config.toml agent sections. */
export const FALLBACK_GLOBAL_LAZYCODEX_AGENTS: LazycodexAgentConfig = {
  explorer: { model: "grok-build", reasoningLevel: "medium" },
  reasoning: { model: "grok-build", reasoningLevel: "high" },
  coding: { model: "grok-build", reasoningLevel: "medium" },
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