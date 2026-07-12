export type ExactAliasRule = {
  aliasModelID: string
  ruleID: string
  canonicalModelID: string
  rationale: string
}

export type PatternAliasRule = {
  ruleID: string
  description: string
  match: (normalizedModelID: string) => boolean
  canonicalize: (normalizedModelID: string) => string
}

export type ModelIDAliasResolution = {
  requestedModelID: string
  canonicalModelID: string
  source: "canonical" | "exact-alias" | "pattern-alias"
  ruleID?: string
}

const EXACT_ALIAS_RULES: ReadonlyArray<ExactAliasRule> = []

const EXACT_ALIAS_RULES_BY_MODEL: ReadonlyMap<string, ExactAliasRule> = new Map(
  EXACT_ALIAS_RULES.map((rule) => [rule.aliasModelID, rule]),
)

const PATTERN_ALIAS_RULES: ReadonlyArray<PatternAliasRule> = []

function normalizeLookupModelID(modelID: string): string {
  return modelID.trim().toLowerCase()
}

function stripProviderPrefixForAliasLookup(normalizedModelID: string): string {
  const slashIndex = normalizedModelID.indexOf("/")
  if (slashIndex <= 0 || slashIndex === normalizedModelID.length - 1) {
    return normalizedModelID
  }

  return normalizedModelID.slice(slashIndex + 1)
}

export function resolveModelIDAlias(modelID: string): ModelIDAliasResolution {
  const requestedModelID = normalizeLookupModelID(modelID)
  const aliasLookupModelID = stripProviderPrefixForAliasLookup(requestedModelID)
  const exactRule = EXACT_ALIAS_RULES_BY_MODEL.get(aliasLookupModelID)
  if (exactRule) {
    return {
      requestedModelID,
      canonicalModelID: exactRule.canonicalModelID,
      source: "exact-alias",
      ruleID: exactRule.ruleID,
    }
  }

  for (const rule of PATTERN_ALIAS_RULES) {
    if (!rule.match(aliasLookupModelID)) {
      continue
    }

    return {
      requestedModelID,
      canonicalModelID: rule.canonicalize(aliasLookupModelID),
      source: "pattern-alias",
      ruleID: rule.ruleID,
    }
  }

  return {
    requestedModelID,
    canonicalModelID: aliasLookupModelID,
    source: "canonical",
  }
}

export function getExactModelIDAliasRules(): ReadonlyArray<ExactAliasRule> {
  return EXACT_ALIAS_RULES
}

export function getPatternModelIDAliasRules(): ReadonlyArray<PatternAliasRule> {
  return PATTERN_ALIAS_RULES
}
