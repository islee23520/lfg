import { resolveModelPipeline, type ModelResolutionRequest, type ModelResolutionResult } from "../ports/vendor/model-core-vendored"
import type { FallbackEntry, ModelRequirement } from "../ports/vendor/model-core-vendored"

export interface ProviderDescriptor {
  readonly providerId: string
  readonly modelPrefixes: readonly string[]
}

export const DEFAULT_PROVIDER_DESCRIPTORS: readonly ProviderDescriptor[] = [
  { providerId: "xai", modelPrefixes: ["grok-"] },
  { providerId: "anthropic", modelPrefixes: ["claude-"] },
  { providerId: "openai", modelPrefixes: ["gpt-", "o1", "o3", "o4"] },
  { providerId: "google", modelPrefixes: ["gemini-"] },
  { providerId: "moonshotai", modelPrefixes: ["kimi-", "k2"] },
  { providerId: "zai", modelPrefixes: ["glm-"] },
  { providerId: "minimax", modelPrefixes: ["minimax-"] },
]

export interface GrokModelCatalogInput {
  /** Bare model ids from Grok's /v1/models, or pre-normalized provider/model ids. */
  readonly modelIds: readonly string[]
  /** Provider descriptors; defaults to DEFAULT_PROVIDER_DESCRIPTORS. */
  readonly providers?: readonly ProviderDescriptor[]
  /**
   * Explicitly connected provider ids (e.g. from config). When omitted, the
   * adapter infers connected providers from which descriptors matched at least
   * one model id.
   */
  readonly connectedProviders?: readonly string[]
}

export interface GrokModelCatalog {
  /** Model ids normalized to model-core's `provider/model-id` form. */
  readonly availableModels: Set<string>
  /** Provider ids that have at least one available model (or were explicitly connected). */
  readonly connectedProviders: string[]
  /** The descriptors used. */
  readonly providers: readonly ProviderDescriptor[]
}

/**
 * Build the Grok model catalog projection for model-core.
 *
 * Normalizes bare model ids (e.g. `grok-4`) into `provider/model-id` form
 * (e.g. `xai/grok-4`) using the provider descriptors. Model ids already in
 * `provider/model-id` form are preserved as-is. Unknown prefixes default to
 * `xai` (Grok's first-party provider) since Grok's proxy is the primary source.
 */
export function buildGrokModelCatalog(input: GrokModelCatalogInput): GrokModelCatalog {
  const providers = input.providers ?? DEFAULT_PROVIDER_DESCRIPTORS
  const normalized = new Set<string>()
  const inferredProviders = new Set<string>()

  for (const rawId of input.modelIds) {
    const id = rawId.trim()
    if (id.length === 0) continue
    if (id.includes("/")) {
      // Already provider-qualified.
      normalized.add(id)
      inferredProviders.add(id.split("/")[0]!)
      continue
    }
    const providerId = inferProvider(id, providers) ?? "xai"
    normalized.add(`${providerId}/${id}`)
    inferredProviders.add(providerId)
  }

  const connected: string[] = input.connectedProviders ? [...input.connectedProviders] : Array.from(inferredProviders)
  return {
    availableModels: normalized,
    connectedProviders: connected,
    providers,
  }
}

function inferProvider(modelId: string, descriptors: readonly ProviderDescriptor[]): string | undefined {
  const lower = modelId.toLowerCase()
  for (const descriptor of descriptors) {
    if (descriptor.modelPrefixes.some((prefix) => lower.startsWith(prefix.toLowerCase()))) {
      return descriptor.providerId
    }
  }
  return undefined
}

/**
 * Resolve a model for a Grok agent/category using the vendored model-core
 * `resolveModelPipeline`. This is the primary entrypoint for Grok agents.
 *
 * If the agent's requirement has no `xai`-provider fallback entries (the
 * upstream tables are OpenCode/Codex-shaped), a Grok fallback entry is appended
 * so Grok first-party models can still resolve via the fallback chain.
 */
export interface GrokModelResolutionInput {
  readonly catalog: GrokModelCatalog
  /** Agent or category key (e.g. "sisyphus", "deep"). */
  readonly requirementKey: string
  /** Requirements table; defaults to the vendored AGENT_MODEL_REQUIREMENTS. */
  readonly requirements?: Record<string, ModelRequirement>
  readonly uiSelectedModel?: string
  readonly userModel?: string
  readonly userFallbackModels?: string[]
  readonly categoryDefaultModel?: string
  readonly systemDefaultModel?: string
}

export interface GrokModelResolutionResult {
  readonly resolved: ModelResolutionResult | undefined
  /** The request that was fed to resolveModelPipeline (for debugging/tests). */
  readonly request: ModelResolutionRequest
}

export function resolveGrokModel(input: GrokModelResolutionInput): GrokModelResolutionResult {
  const requirements = input.requirements ?? {}
  const requirement = requirements[input.requirementKey]
  const fallbackChain = withGrokFallback(requirement?.fallbackChain, input.catalog)

  const request: ModelResolutionRequest = {
    intent: {
      uiSelectedModel: input.uiSelectedModel,
      userModel: input.userModel,
      userFallbackModels: input.userFallbackModels,
      categoryDefaultModel: input.categoryDefaultModel,
    },
    constraints: {
      availableModels: input.catalog.availableModels,
      connectedProviders: input.catalog.connectedProviders,
    },
    policy: {
      ...(fallbackChain.length > 0 ? { fallbackChain } : {}),
      ...(input.systemDefaultModel !== undefined ? { systemDefaultModel: input.systemDefaultModel } : {}),
    },
  }

  const resolved = resolveModelPipeline(request)
  return { resolved, request }
}

/**
 * Append a Grok (xai) fallback entry to a requirement's fallback chain when the
 * upstream chain has no xai provider entry. This lets Grok first-party models
 * resolve via the fallback chain instead of always falling through to
 * systemDefaultModel.
 *
 * The Grok entry uses the first available xai model (fuzzy-matched by prefix),
 * or `grok-4` as a generic default.
 */
function withGrokFallback(chain: readonly FallbackEntry[] | undefined, catalog: GrokModelCatalog): FallbackEntry[] {
  const base = chain ? [...chain] : []
  if (base.some((entry) => entry.providers.includes("xai"))) return base
  if (!catalog.connectedProviders.includes("xai")) return base

  const grokModel = pickGrokModel(catalog.availableModels)
  if (grokModel === undefined) return base

  base.push({ providers: ["xai"], model: grokModel })
  return base
}

function pickGrokModel(available: Set<string>): string | undefined {
  const grokModels = Array.from(available).filter((m) => m.startsWith("xai/grok-"))
  if (grokModels.length === 0) return undefined
  const bare = grokModels.map((m) => m.split("/").slice(1).join("/"))
  bare.sort((a, b) => a.length - b.length)
  return bare[0]
}
