import { normalizeModelID } from "./model-normalization"

export type HeuristicModelFamilyDefinition = {
  family: string
  includes?: string[]
  pattern?: RegExp
  variants?: string[]
  reasoningEfforts?: string[]
  reasoningEffortAliases?: Record<string, string>
  supportsThinking?: boolean
}

export const HEURISTIC_MODEL_FAMILY_REGISTRY: ReadonlyArray<HeuristicModelFamilyDefinition> = [
  {
    family: "grok",
    includes: ["grok"],
    variants: ["low", "medium", "high"],
    reasoningEfforts: ["low", "medium", "high"],
  },
]

export function detectHeuristicModelFamily(modelID: string): HeuristicModelFamilyDefinition | undefined {
  const normalizedModelID = normalizeModelID(modelID).toLowerCase()

  for (const definition of HEURISTIC_MODEL_FAMILY_REGISTRY) {
    if (definition.pattern?.test(normalizedModelID)) {
      return definition
    }

    if (definition.includes?.some((value) => normalizedModelID.includes(value))) {
      return definition
    }
  }

  return undefined
}
