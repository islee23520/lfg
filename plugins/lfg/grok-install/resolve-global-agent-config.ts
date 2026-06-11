import type { LazycodexAgentConfig, ModelDiscovery } from "../bin/lfg-models"
import { defaultLazycodexAgentConfig } from "../bin/lfg-models"
import { readLazycodexAgentsFromGrokConfig } from "./read-lazycodex-agents-from-config"

/** Grok global ledger defaults when no discovery and no config.toml agent sections. */
export const FALLBACK_GLOBAL_LAZYCODEX_AGENTS: LazycodexAgentConfig = {
  explorer: { model: "gpt-5.4-mini", reasoningLevel: "low" },
  reasoning: { model: "gpt-5.5", reasoningLevel: "high" },
  coding: { model: "gpt-5.3-codex-spark", reasoningLevel: "medium" },
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