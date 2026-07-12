import type { VariantTable } from "./types"

export type ResolveVariantInput = {
  readonly modelID?: string
  readonly agentName?: string
  readonly variants: VariantTable
}

/**
 * Selects a prompt variant. With Grok-only prompt tables there are no
 * model-family variants, so every agent uses the bundled `default` variant
 * (or the first available variant when no `default` exists, e.g. the codex
 * ultrawork table). `modelID`/`agentName` are accepted for callers that pass
 * them but no longer affect selection.
 */
export function resolveVariant(input: ResolveVariantInput): string {
  const variantNames = Object.keys(input.variants)
  if (variantNames.length === 0) {
    throw new TypeError("resolveVariant requires at least one prompt variant")
  }

  if (variantNames.includes("default")) return "default"

  return variantNames[0]
}
