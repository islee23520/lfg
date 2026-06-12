import { isRecord } from "./lfg-json"
import { toPositiveInt } from "./lfg-model-metadata"

const PUBLIC_LITELLM_CATALOG_URL =
  "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json"

export async function loadPublicLiteLLMContextMap(): Promise<Readonly<Record<string, number>>> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 4500)
  try {
    const response = await fetch(PUBLIC_LITELLM_CATALOG_URL, { signal: controller.signal })
    if (!response.ok) return {}
    const data: unknown = await response.json()
    if (!isRecord(data)) return {}
    const out: Record<string, number> = {}
    for (const [rawKey, spec] of Object.entries(data)) {
      if (rawKey === "sample_spec" || !isRecord(spec)) continue
      const maxInputTokens = toPositiveInt(spec.max_input_tokens)
      const maxTokens = toPositiveInt(spec.max_tokens)
      const contextWindow = maxInputTokens ?? maxTokens
      if (contextWindow === null) continue
      out[rawKey] = contextWindow
      const normalized = aliasGroupKey(rawKey)
      if (!out[normalized]) out[normalized] = contextWindow
      const providerStripped = rawKey.includes("/") ? rawKey.split("/").pop() : rawKey
      if (providerStripped === undefined) continue
      const strippedNormalized = aliasGroupKey(providerStripped)
      if (!out[strippedNormalized]) out[strippedNormalized] = contextWindow
    }
    return out
  } catch {
    return {}
  } finally {
    clearTimeout(timer)
  }
}

export function aliasGroupKey(modelId: string): string {
  return modelId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}
