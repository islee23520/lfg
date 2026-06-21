import { isRecord } from "./lfg-json"
import { aliasGroupKey } from "./lfg-model-context-catalog"
import type { ReasoningLevel } from "./lfg-models"

export type ModelFeatureMetadata = {
  readonly usable?: boolean
  readonly features?: readonly string[]
  readonly reasoningEffort?: ReasoningLevel
}

export function extractContextWindows(payload: unknown): Readonly<Record<string, number>> | undefined {
  if (!isRecord(payload) || !Array.isArray(payload.data)) return undefined
  const out: Record<string, number> = {}
  for (const item of payload.data) {
    if (!isRecord(item) || typeof item.id !== "string") continue
    const contextWindow = pickContextWindow(item)
    if (contextWindow !== null) out[item.id] = contextWindow
  }
  return Object.keys(out).length > 0 ? out : undefined
}

export function extractModelFeatureMetadata(payload: unknown): Readonly<Record<string, ModelFeatureMetadata>> | undefined {
  if (!isRecord(payload) || !Array.isArray(payload.data)) return undefined
  const out: Record<string, ModelFeatureMetadata> = {}
  for (const item of payload.data) {
    if (!isRecord(item) || typeof item.id !== "string") continue
    const metadata = pickModelFeatureMetadata(item)
    if (metadata !== null) out[item.id] = metadata
  }
  return Object.keys(out).length > 0 ? out : undefined
}

export function toPositiveInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.floor(value)
  if (typeof value === "string") {
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed)
  }
  return null
}

export function resolveReasoningEffortForModel(
  metadata: Readonly<Record<string, ModelFeatureMetadata>> | undefined,
  modelId: string,
  fallback: ReasoningLevel,
): ReasoningLevel {
  if (metadata === undefined) return fallback
  const normalized = aliasGroupKey(modelId)
  return metadata[modelId]?.reasoningEffort ?? metadata[normalized]?.reasoningEffort ?? fallback
}

function pickContextWindow(item: Record<string, unknown>): number | null {
  const candidates = [
    "context_window",
    "contextWindow",
    "context_window_size",
    "contextWindowSize",
    "max_model_len",
    "maxModelLen",
    "max_model_length",
    "maxModelLength",
    "max_input_tokens",
    "maxInputTokens",
    "max_tokens",
    "maxTokens",
    "n_ctx",
    "nCtx",
  ] as const
  for (const key of candidates) {
    const parsed = toPositiveInt(item[key])
    if (parsed !== null) return parsed
  }
  const nested = isRecord(item.info) ? item.info : isRecord(item.limits) ? item.limits : null
  if (nested !== null) {
    for (const key of candidates) {
      const parsed = toPositiveInt(nested[key])
      if (parsed !== null) return parsed
    }
  }
  return null
}

function pickModelFeatureMetadata(item: Record<string, unknown>): ModelFeatureMetadata | null {
  const usable = pickBoolean(item, ["usable", "available", "enabled"])
  const features = pickFeatureList(item)
  const reasoningEffort = pickReasoningEffort(item)
  if (usable === undefined && features.length === 0 && reasoningEffort === undefined) return null
  return {
    ...(usable === undefined ? {} : { usable }),
    ...(features.length === 0 ? {} : { features }),
    ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
  }
}

function pickBoolean(item: Record<string, unknown>, keys: readonly string[]): boolean | undefined {
  for (const key of keys) {
    const direct = parseBoolean(item[key])
    if (direct !== undefined) return direct
  }
  const nested = isRecord(item.info) ? item.info : isRecord(item.metadata) ? item.metadata : null
  if (nested === null) return undefined
  for (const key of keys) {
    const parsed = parseBoolean(nested[key])
    if (parsed !== undefined) return parsed
  }
  return undefined
}

function parseBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value
  if (typeof value !== "string") return undefined
  const normalized = value.trim().toLowerCase()
  if (normalized === "true") return true
  if (normalized === "false") return false
  return undefined
}

function pickReasoningEffort(item: Record<string, unknown>): ReasoningLevel | undefined {
  const keys = [
    "reasoning_effort",
    "reasoningEffort",
    "model_reasoning_effort",
    "modelReasoningEffort",
    "default_reasoning_effort",
    "defaultReasoningEffort",
  ] as const
  for (const key of keys) {
    const parsed = parseReasoningLevel(item[key])
    if (parsed !== undefined) return parsed
  }
  const nested = isRecord(item.info) ? item.info : isRecord(item.metadata) ? item.metadata : null
  if (nested === null) return undefined
  for (const key of keys) {
    const parsed = parseReasoningLevel(nested[key])
    if (parsed !== undefined) return parsed
  }
  return undefined
}

function parseReasoningLevel(value: unknown): ReasoningLevel | undefined {
  if (typeof value !== "string") return undefined
  const normalized = value.trim().toLowerCase()
  if (normalized === "low" || normalized === "medium" || normalized === "high" || normalized === "xhigh") {
    return normalized
  }
  return undefined
}

function pickFeatureList(item: Record<string, unknown>): readonly string[] {
  const sources = [
    item.features,
    item.feature_flags,
    item.capabilities,
    item.supported_features,
    isRecord(item.info) ? item.info.features : undefined,
    isRecord(item.metadata) ? item.metadata.features : undefined,
  ]
  const features = new Set<string>()
  for (const source of sources) {
    for (const feature of parseFeatureSource(source)) {
      features.add(feature)
    }
  }
  return [...features].sort()
}

function parseFeatureSource(value: unknown): readonly string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())
  }
  if (isRecord(value)) {
    return Object.entries(value)
      .filter((entry) => entry[1] === true)
      .map(([key]) => key)
      .filter((key) => key.trim().length > 0)
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
  }
  return []
}
