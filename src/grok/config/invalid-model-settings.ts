export function isGrokFamilyModel(model: string): boolean {
  const id = stripProviderPrefix(model)
  return id.startsWith("grok-build") || /^grok[-_/]/i.test(id)
}

export function isForeignProviderModel(model: string): boolean {
  const id = stripProviderPrefix(model)
  return /^(gpt|o[0-9]|claude|gemini|glm|deepseek|qwen|mistral|codex|chatgpt)/i.test(id)
}

/**
 * Catalog membership for model routes.
 *
 * - Empty catalog: allow Grok-family ids as host-native defaults (vanilla / pre-discovery).
 * - Non-empty catalog: membership only (provider prefix stripped). Unavailable `grok-*`
 *   names are NOT auto-kept — install must route agents to models that actually exist.
 * - Display aliases match via alias-group key so `GPT-5.5` and `gpt-5.5` are the same model.
 */
export function modelIsAvailable(model: string, available: ReadonlySet<string>): boolean {
  if (model.trim().length === 0) return false
  if (available.size === 0) {
    return isGrokFamilyModel(model)
  }
  if (available.has(model)) return true
  const tail = stripProviderPrefix(model)
  if (available.has(tail)) return true
  const modelGroup = aliasGroupKey(tail)
  for (const candidate of available) {
    const candidateTail = stripProviderPrefix(candidate)
    if (candidate === tail || candidateTail === model || candidateTail === tail) return true
    if (aliasGroupKey(candidateTail) === modelGroup) return true
  }
  return false
}

function aliasGroupKey(modelId: string): string {
  return modelId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/** True when an unavailable model should be remapped (foreign leftovers or unknown Grok ids). Custom non-provider ids stay. */
export function shouldRemapUnavailableModel(model: string, available: ReadonlySet<string>): boolean {
  if (modelIsAvailable(model, available)) return false
  return isForeignProviderModel(model) || isGrokFamilyModel(model)
}

export type RoleModelFallback = {
  readonly default: string
  readonly fast: string
  readonly reasoning: string
  readonly coding: string
}

export function pickRoleFallbacks(available: readonly string[]): RoleModelFallback {
  const ids = available.length > 0 ? available : ["grok-4.5", "grok-composer-2.5-fast"]
  const reasoning =
    ids.find((id) => /grok-4\.5/i.test(id)) ??
    ids.find((id) => /grok-4/i.test(id)) ??
    ids.find(isGrokFamilyModel) ??
    ids[0] ??
    "grok-4.5"
  const fast =
    ids.find((id) => /composer/i.test(id)) ??
    ids.find((id) => /fast/i.test(id)) ??
    ids.find((id) => /non-reasoning/i.test(id)) ??
    reasoning
  const coding = ids.find((id) => /composer/i.test(id)) ?? ids.find((id) => /build/i.test(id)) ?? fast
  return { default: reasoning, fast, reasoning, coding }
}

export function roleFallbackForAgent(agentName: string, fallbacks: RoleModelFallback): string {
  const name = agentName.toLowerCase()
  if (
    name === "coding" ||
    name === "builder" ||
    name === "grok-build" ||
    name === "reviewer" ||
    name === "codex-ultrawork-reviewer"
  ) {
    return fallbacks.coding
  }
  if (
    name === "explorer" ||
    name === "explore" ||
    name === "librarian" ||
    name === "quick" ||
    name === "unspecified-low" ||
    name === "general-purpose" ||
    name === "sisyphus-junior" ||
    name === "visual-looker"
  ) {
    return fallbacks.fast
  }
  return fallbacks.reasoning
}

function stripProviderPrefix(model: string): string {
  const index = model.lastIndexOf("/")
  return index === -1 ? model : model.slice(index + 1)
}
