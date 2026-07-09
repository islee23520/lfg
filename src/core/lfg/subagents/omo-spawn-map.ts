export const OMO_SPAWN_TYPE_TO_LFG_SUBAGENT: Readonly<Record<string, string>> = {
  explore: "explorer",
  "general-purpose": "sisyphus",
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
