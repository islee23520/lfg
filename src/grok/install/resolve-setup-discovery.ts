import type { ModelDiscovery } from "../../cli/models/lfg-models"
import { fetchModelDiscovery, fetchMultiProviderDiscovery } from "../../cli/models/lfg-models"
import { readGrokModelsBaseUrlFromConfig } from "../models/read-grok-models-base-url"
import { readOmoProvidersFromConfig } from "../models/read-omo-providers-from-config"

export const DEFAULT_SETUP_MODELS_BASE_URL = "http://127.0.0.1:8317/v1" as const

export type ResolveSetupDiscoveryOptions = {
  readonly home: string
  readonly cliBaseUrl: string | null
  readonly envBaseUrl?: string | null
  readonly hostAuthOnly?: boolean
}

export type ResolveSetupDiscoveryResult = {
  readonly discovery: ModelDiscovery | null
  readonly baseUrlUsed: string | null
  readonly baseUrlSource: "cli" | "providers" | "config" | "env" | "default" | "none"
  readonly autoDiscovered: boolean
}

/**
 * Resolve model discovery for setup without manual URL entry when possible.
 * Priority: --base-url → LFG_GROK_BASE_URL / LAZYCODEX_OPENAI_BASE_URL → config.toml → local proxy default.
 */
export async function resolveSetupDiscovery(options: ResolveSetupDiscoveryOptions): Promise<ResolveSetupDiscoveryResult> {
  const envUrl = trimUrl(options.envBaseUrl ?? process.env.LFG_GROK_BASE_URL ?? process.env.LAZYCODEX_OPENAI_BASE_URL)
  const configUrl = await readGrokModelsBaseUrlFromConfig(options.home)
  // OpenGrok: when the user declares [omo.providers.*] in config.toml, discover from every
  // provider and merge, so Grok Build can reach many models. An explicit --base-url still wins.
  if (options.cliBaseUrl === null) {
    const providers = await readOmoProvidersFromConfig(options.home)
    if (providers.length > 0) {
      try {
        const discovery = await fetchMultiProviderDiscovery(providers)
        return { discovery, baseUrlUsed: null, baseUrlSource: "providers", autoDiscovered: true }
      } catch {
        // every provider failed; fall through to the single-proxy candidates below
      }
    }
  }
  const usesHostAuthOnly = options.hostAuthOnly === true && options.cliBaseUrl === null
  const skipDefaultProxy =
    process.env.LFG_DISABLE_DEFAULT_MODELS_PROXY === "1" ||
    process.env.LFG_DISABLE_DEFAULT_MODELS_PROXY === "true"
  const candidates: readonly { readonly url: string; readonly source: ResolveSetupDiscoveryResult["baseUrlSource"] }[] = [
    ...(options.cliBaseUrl ? [{ url: options.cliBaseUrl, source: "cli" as const }] : []),
    ...(usesHostAuthOnly ? [] : envUrl ? [{ url: envUrl, source: "env" as const }] : []),
    ...(usesHostAuthOnly ? [] : configUrl ? [{ url: configUrl, source: "config" as const }] : []),
    ...(usesHostAuthOnly || skipDefaultProxy ? [] : [{ url: DEFAULT_SETUP_MODELS_BASE_URL, source: "default" as const }]),
  ]

  const seen = new Set<string>()
  for (const candidate of candidates) {
    const key = candidate.url.trim()
    if (key.length === 0 || seen.has(key)) {
      continue
    }
    seen.add(key)
    try {
      const discovery = await fetchModelDiscovery(key)
      return {
        discovery,
        baseUrlUsed: key,
        baseUrlSource: candidate.source,
        autoDiscovered: options.cliBaseUrl === null,
      }
    } catch {
      continue
    }
  }

  return { discovery: null, baseUrlUsed: null, baseUrlSource: "none", autoDiscovered: false }
}

function trimUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : null
}
