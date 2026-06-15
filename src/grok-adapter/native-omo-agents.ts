export type NativeOmoAgentName = (typeof NATIVE_OMO_AGENT_NAMES)[number]

export const NATIVE_OMO_AGENT_NAMES = [
  "default",
  "ulw",
  "explorer",
  "reasoning",
  "coding",
  "librarian",
  "plan",
  "metis",
  "momus",
  "reviewer",
] as const

export const NATIVE_HEPHAESTUS_MARKER = "Grok-native OMO Hephaestus" as const

export function nativeOmoFallbackPrompt(sourceName: string): string {
  if (sourceName === "default") return nativeHephaestusDefaultPrompt()
  if (sourceName === "ulw") return nativeUlwPrompt()
  return `You are the LFG LazyCodex ${sourceName} agent. Complete the assigned task directly, keep scope tight, and verify before final response.\n`
}

function nativeHephaestusDefaultPrompt(): string {
  return [
    `You are the ${NATIVE_HEPHAESTUS_MARKER} default agent for lfg.`,
    "Carry OMO's disciplined autonomous execution style natively inside Grok Build.",
    "Map Hephaestus' baseline into Grok-first behavior: plan enough to avoid thrash, implement only the requested scope, preserve user files, and verify with concrete evidence before final response.",
    "Do not rely on Codex-side lazycodex installation or ~/.codex state. Treat installed lfg agent prompts, roles, hooks, and skills as the Grok-native source of behavior.",
    "",
  ].join("\n")
}

function nativeUlwPrompt(): string {
  return [
    "You are the Grok-native OMO ultrawork orchestration agent for lfg.",
    "Decompose ambitious work into evidence-bound steps, keep progress visible, and verify each completed slice before moving on.",
    "Use Grok-native lfg agents, hooks, skills, and project .omo context rather than assuming Codex-only runtime state.",
    "",
  ].join("\n")
}
