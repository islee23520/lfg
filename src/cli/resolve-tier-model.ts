import type { ServiceTier } from "../grok-adapter/lazycodex-agent-overrides"

/** Grok Build routes by model id, not Codex-style service_tier. Map tier choice to catalog ids. */
export function serviceTierFromChoice(tier: string): ServiceTier {
  return tier === "fast" ? "fast" : "default"
}

/** Default service tier prompt for high-volume read-only / utility agents. */
export function defaultTierPromptForAgent(agentName: string): ServiceTier {
  if (agentName === "explorer" || agentName === "librarian") {
    return "fast"
  }
  return "default"
}

export function resolveModelForServiceTier(
  modelIds: readonly string[],
  selectedModel: string,
  tier: string,
  options?: { readonly mappingFast?: string; readonly mappingDefault?: string },
): string {
  if (tier === "fast") {
    return resolveFastModelId(modelIds, selectedModel, options?.mappingFast)
  }
  return resolveDefaultModelId(modelIds, selectedModel, options?.mappingDefault)
}

/** Prefer a `-fast` sibling in the catalog, then discovery mapping.fast. */
export function resolveFastModelId(
  modelIds: readonly string[],
  model: string,
  mappingFast?: string,
): string {
  if (modelLooksFast(model)) {
    return model
  }
  const fastSibling = findFastSiblingId(modelIds, model)
  if (fastSibling !== null) {
    return fastSibling
  }
  if (typeof mappingFast === "string" && mappingFast.length > 0 && modelIds.includes(mappingFast)) {
    return mappingFast
  }
  return model
}

/** Prefer stripping `-fast` when present, else mapping.default. */
export function resolveDefaultModelId(
  modelIds: readonly string[],
  model: string,
  mappingDefault?: string,
): string {
  if (!modelLooksFast(model)) {
    return model
  }
  const withoutSuffix = model.replace(/-fast$/i, "")
  if (withoutSuffix.length > 0 && modelIds.includes(withoutSuffix)) {
    return withoutSuffix
  }
  const aliasStripped = modelIds.find(
    (id) => id.toLowerCase() === withoutSuffix.toLowerCase() || tailId(id).toLowerCase() === withoutSuffix.toLowerCase(),
  )
  if (aliasStripped !== undefined) {
    return aliasStripped
  }
  if (typeof mappingDefault === "string" && mappingDefault.length > 0 && modelIds.includes(mappingDefault)) {
    return mappingDefault
  }
  return model
}

function modelLooksFast(model: string): boolean {
  const tail = tailId(model).toLowerCase()
  return tail.includes("fast") || /-(mini-)?fast$/.test(tail)
}

function findFastSiblingId(modelIds: readonly string[], model: string): string | null {
  const tail = tailId(model)
  const candidates = [`${tail}-fast`, tail.replace(/-mini$/i, "-mini-fast")]
  for (const candidate of candidates) {
    const full = withSamePrefix(model, candidate)
    const found =
      modelIds.find((id) => id === full) ??
      modelIds.find((id) => tailId(id).toLowerCase() === candidate.toLowerCase())
    if (found !== undefined) {
      return found
    }
  }
  return null
}

function tailId(model: string): string {
  const slash = model.lastIndexOf("/")
  return slash >= 0 ? model.slice(slash + 1) : model
}

function withSamePrefix(model: string, newTail: string): string {
  const slash = model.lastIndexOf("/")
  return slash >= 0 ? `${model.slice(0, slash + 1)}${newTail}` : newTail
}