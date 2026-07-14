/**
 * Map OMO/OpenCode spawn labels onto GrokBuild `subagent_type` ids.
 * Option 2C: redirect generic builtin labels to OMO personas that carry
 * the desired behavior patterns (host builtins cannot be prompt-overridden).
 * Specialists (librarian, oracle, momus, metis, coding, reviewer) stay identity-mapped.
 */
export const OMO_SPAWN_TYPE_TO_LFG_SUBAGENT: Readonly<Record<string, string>> = {
  // Builtin redirects: OMO-originated spawns use persona prompts/models
  explore: "explorer",
  "general-purpose": "sisyphus",
  plan: "prometheus",
  // Shadow aliases
  "grok-build": "coding",
  builder: "reviewer",
  // OMO personas (identity mapping)
  explorer: "explorer",
  librarian: "librarian",
  oracle: "oracle",
  prometheus: "prometheus",
  atlas: "atlas",
  metis: "metis",
  momus: "momus",
  hephaestus: "hephaestus",
  sisyphus: "sisyphus",
  "multimodal-looker": "multimodal-looker",
  "sisyphus-junior": "sisyphus-junior",
  reviewer: "reviewer",
  coding: "coding",
  reasoning: "reasoning",
  // Difficulty-tier implementation workers (upstream lazycodex-worker-*; identity on Grok)
  "lazycodex-worker-low": "lazycodex-worker-low",
  "lazycodex-worker-medium": "lazycodex-worker-medium",
  "lazycodex-worker-high": "lazycodex-worker-high",
} as const

export function lfgSubagentForOmoSpawnType(omoSpawnType: string): string {
  return OMO_SPAWN_TYPE_TO_LFG_SUBAGENT[omoSpawnType] ?? omoSpawnType
}
