export type GjcIntentClassification = {
  readonly intent: string
  readonly ambiguity: "low" | "med" | "high"
  readonly route: "codex" | "clarify" | "chat" | "git" | "explore"
  readonly refinedFocus?: string
}

export type GjcIntentResult = {
  readonly status: "classified" | "missing" | "timeout" | "malformed" | "error"
  readonly classification?: GjcIntentClassification
}

export function shouldSkipGjcIntent(prompt: unknown): boolean
export function parseGjcIntentOutput(stdout: unknown): GjcIntentClassification | null
export function buildGjcIntentContext(result: GjcIntentResult): string
