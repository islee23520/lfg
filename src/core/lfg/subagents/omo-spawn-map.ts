/**
 * Map OMO/OpenCode spawn labels onto GrokBuild `subagent_type` ids.
 * Prefer host built-ins (`explore`, `general-purpose`) over lfg duplicates when the job is generic.
 * Keep lfg personas for OMO-specific roles (librarian, coding, sisyphus, …).
 */
export const OMO_SPAWN_TYPE_TO_LFG_SUBAGENT: Readonly<Record<string, string>> = {
  explore: "explore",
  explorer: "explorer",
  "general-purpose": "general-purpose",
  "grok-build": "coding",
  builder: "reviewer",
  plan: "plan",
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
} as const

export function lfgSubagentForOmoSpawnType(omoSpawnType: string): string {
  return OMO_SPAWN_TYPE_TO_LFG_SUBAGENT[omoSpawnType] ?? omoSpawnType
}
