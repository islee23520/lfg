import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import type { ReasoningLevel } from "../bin/lfg-models"

export type FallbackResolveResult = {
  readonly agent: string
  readonly primary: { readonly model: string; readonly model_reasoning_effort: ReasoningLevel; readonly service_tier: string } | null
  readonly effective: { readonly model: string; readonly model_reasoning_effort: ReasoningLevel; readonly service_tier: string } | null
  readonly using_fallback: boolean
  readonly reason: string
  readonly source: string | null
  readonly fallback_available: boolean
  readonly message?: string
}

type StoredOverride = {
  readonly model?: string
  readonly reasoning_level?: string
  readonly model_reasoning_effort?: string
  readonly service_tier?: string
  readonly model_fallback?: string
  readonly model_fallback_reasoning_effort?: string
  readonly model_fallback_service_tier?: string
}

type StoredFile = {
  readonly version?: number
  readonly overrides?: Readonly<Record<string, StoredOverride>>
}

function overridesPath(home: string): string {
  return join(home, ".grok", "lazycodex-agent-overrides.json")
}

function getHome(options: { readonly env?: NodeJS.ProcessEnv }): string {
  return options.env?.HOME?.trim() || homedir()
}

export async function resolveModelFallback(
  agentName: string,
  options: { readonly env?: NodeJS.ProcessEnv; readonly onError?: string } = {},
): Promise<FallbackResolveResult> {
  const home = getHome(options)
  const path = overridesPath(home)

  if (!existsSync(path)) {
    return {
      agent: agentName,
      primary: null,
      effective: null,
      using_fallback: false,
      reason: "no-config",
      source: null,
      fallback_available: false,
      message: "No lazycodex-agent-overrides.json found. Run `lfg setup` first.",
    }
  }

  let parsed: StoredFile
  try {
    parsed = JSON.parse(await readFile(path, "utf8")) as StoredFile
  } catch {
    return {
      agent: agentName,
      primary: null,
      effective: null,
      using_fallback: false,
      reason: "parse-error",
      source: path,
      fallback_available: false,
      message: `Failed to parse ${path}`,
    }
  }

  const entry = parsed.overrides?.[agentName]
  if (entry?.model === undefined) {
    return {
      agent: agentName,
      primary: null,
      effective: null,
      using_fallback: false,
      reason: "no-entry",
      source: path,
      fallback_available: false,
      message: `No override entry for agent "${agentName}".`,
    }
  }

  const primary = {
    model: entry.model,
    model_reasoning_effort: (entry.reasoning_level ?? entry.model_reasoning_effort ?? "low") as ReasoningLevel,
    service_tier: entry.service_tier ?? "default",
  }

  const onError = String(options.onError ?? "").toLowerCase()
  const shouldFallback = onError.length > 0 && (
    onError.includes("quota") || onError.includes("rate") ||
    onError.includes("429") || onError.includes("limit") ||
    onError.includes("error") || onError.includes("fail")
  )

  const effective = shouldFallback && entry.model_fallback
    ? {
        model: entry.model_fallback,
        model_reasoning_effort: (entry.model_fallback_reasoning_effort ?? primary.model_reasoning_effort) as ReasoningLevel,
        service_tier: entry.model_fallback_service_tier ?? primary.service_tier,
      }
    : primary

  return {
    agent: agentName,
    primary,
    effective,
    using_fallback: effective.model !== primary.model,
    reason: shouldFallback ? onError : "primary",
    source: path,
    fallback_available: entry.model_fallback !== undefined && entry.model_fallback.length > 0,
  }
}
