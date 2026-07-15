/**
 * OMO-like external engine: GPT through Codex CLI.
 * Grok stays the orchestrator (Sisyphus). Pure registry — no spawn.
 */

export const ENGINES = ["gpt"] as const
export type Engine = (typeof ENGINES)[number]
export const DEFAULT_BACKEND_ENGINE: Engine = "gpt"

/** Retired engine ids still accepted as aliases when parsing user/config input. */
const ENGINE_ALIASES: Readonly<Record<string, Engine>> = {
  claude: "gpt",
  agy: "gpt",
  gemini: "gpt",
}

export type EngineProfile = {
  readonly id: Engine
  /** PATH binary. */
  readonly binary: string
  /** OMO-family this engine stands in for. */
  readonly omoFamily: "gpt"
  readonly strengths: readonly ("code" | "review" | "oracle" | "vision" | "explore")[]
  readonly notes: string
}

export const ENGINE_PROFILES: Readonly<Record<Engine, EngineProfile>> = {
  gpt: {
    id: "gpt",
    binary: "codex",
    omoFamily: "gpt",
    strengths: ["oracle", "review", "code", "explore"],
    notes: "Codex CLI (GPT) — OMO oracle / deep / adversarial review lane.",
  },
}

export function isEngine(value: unknown): value is Engine {
  return typeof value === "string" && (ENGINES as readonly string[]).includes(value)
}

/** Normalize user/config engine ids; retired engines all map to Codex. */
export function normalizeEngine(value: unknown): Engine | undefined {
  if (typeof value !== "string") return undefined
  const key = value.trim().toLowerCase()
  if (isEngine(key)) return key
  return ENGINE_ALIASES[key]
}

export function backendEngineSelectionJson(selected: Engine): {
  readonly selected: Engine
  readonly default: Engine
  readonly supported: readonly Engine[]
} {
  return { selected, default: DEFAULT_BACKEND_ENGINE, supported: [...ENGINES] }
}
