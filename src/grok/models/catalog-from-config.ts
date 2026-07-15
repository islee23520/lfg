import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { parseOmoProviders } from "./read-omo-providers-from-config"
import { buildGrokModelCatalog, type GrokModelCatalog } from "./grok-model-adapter"

/**
 * Host-side catalog projection from ~/.grok/config.toml.
 *
 * OMO agent/category requirements are pure preference tables; they do not read
 * the filesystem. This module feeds them with what the user actually has:
 * - `[endpoints].models_base_url` (CLI proxy such as 9router / local OpenAI-compatible)
 * - `[omo.providers.*]` multi-endpoint proxies
 * - `[omo.models].available`
 * - `[model.*]` registered Grok model aliases
 */

export type ConfigTomlCatalogSource = {
  /** True when a CLI proxy base URL or omo.providers entry is configured. */
  readonly hasCliProxy: boolean
  readonly modelsBaseUrl: string | null
  readonly providerIds: readonly string[]
  /** Model ids collected from config (bare or provider/model). */
  readonly modelIds: readonly string[]
  readonly catalog: GrokModelCatalog
}

export function parseGrokModelCatalogFromConfigToml(source: string): ConfigTomlCatalogSource {
  const modelsBaseUrl = findTomlStringInSection(source, "endpoints", "models_base_url")
  const providers = parseOmoProviders(source)
  const providerIds = providers.map((p) => p.id)
  const fromAvailable = parseOmoModelsAvailable(source)
  const fromModelSections = parseModelSectionIds(source)
  const modelIds = uniqueNonEmpty([...fromAvailable, ...fromModelSections])
  const inferred = buildGrokModelCatalog({ modelIds })
  // When multi-provider sections exist, treat those ids as connected even if
  // no models were written yet (resolution can still use connectedProviders).
  const catalog =
    providerIds.length > 0
      ? buildGrokModelCatalog({
          modelIds,
          connectedProviders: uniqueNonEmpty([...inferred.connectedProviders, ...providerIds, "xai"]),
        })
      : inferred

  return {
    hasCliProxy: (modelsBaseUrl !== null && modelsBaseUrl.length > 0) || providers.length > 0,
    modelsBaseUrl,
    providerIds,
    modelIds,
    catalog,
  }
}

export async function readGrokModelCatalogFromHome(home: string): Promise<ConfigTomlCatalogSource | null> {
  const path = join(home, ".grok", "config.toml")
  try {
    const text = await readFile(path, "utf8")
    return parseGrokModelCatalogFromConfigToml(text)
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
      return null
    }
    throw error
  }
}

/** True when discovered/config model ids look multi-provider (CLI proxy / 9router style). */
export function catalogLooksLikeCliProxy(modelIds: readonly string[]): boolean {
  for (const raw of modelIds) {
    const id = raw.trim()
    if (id.length === 0) continue
    if (id.includes("/")) {
      const provider = id.split("/")[0]!.toLowerCase()
      if (provider !== "xai" && provider !== "grok") return true
      continue
    }
    const lower = id.toLowerCase()
    if (
      lower.startsWith("gpt-") ||
      lower.startsWith("o1") ||
      lower.startsWith("o3") ||
      lower.startsWith("o4") ||
      lower.startsWith("claude-") ||
      lower.startsWith("gemini-") ||
      lower.startsWith("kimi-") ||
      lower.startsWith("glm-") ||
      lower.startsWith("minimax") ||
      lower.startsWith("qwen")
    ) {
      return true
    }
  }
  return false
}

function parseOmoModelsAvailable(source: string): string[] {
  const body = sectionBody(source, "omo.models")
  if (body === null) return []
  const match = /^\s*available\s*=\s*\[([\s\S]*?)\]/m.exec(body)
  if (match?.[1] === undefined) return []
  const out: string[] = []
  for (const line of match[1].split("\n")) {
    const m = line.match(/^\s*"([^"]+)"\s*,?\s*$/)
    if (m?.[1]) out.push(m[1])
  }
  return out
}

function parseModelSectionIds(source: string): string[] {
  const out: string[] = []
  const re = /^\[model\.([^\]]+)\]\s*$/gm
  let match: RegExpExecArray | null
  while ((match = re.exec(source)) !== null) {
    const headerId = unwrapTomlKey(match[1]!.trim())
    const headerEnd = match.index + match[0].length
    const rest = source.slice(headerEnd)
    const nextHeader = /\n\[[^\n]+\]/.exec(rest)
    const body = nextHeader?.index === undefined ? rest : rest.slice(0, nextHeader.index)
    const explicit = findTomlStringValue(body, "model")
    // Prefer the inner model = "..." value; fall back to the section key.
    out.push(explicit && explicit.length > 0 ? explicit : headerId)
  }
  return out
}

function sectionBody(source: string, section: string): string | null {
  const header = `[${section}]`
  const start = source.indexOf(header)
  if (start === -1) return null
  const bodyStart = start + header.length
  const rest = source.slice(bodyStart)
  const nextHeader = /\n\[[^\n]+\]/.exec(rest)
  return nextHeader?.index === undefined ? rest : rest.slice(0, nextHeader.index)
}

function findTomlStringInSection(source: string, section: string, key: string): string | null {
  const body = sectionBody(source, section)
  if (body === null) return null
  return findTomlStringValue(body, key)
}

function findTomlStringValue(body: string, key: string): string | null {
  const pattern = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*(.+)$`, "m")
  const match = pattern.exec(body)
  if (!match?.[1]) return null
  return parseTomlStringValue(match[1].trim())
}

function parseTomlStringValue(raw: string): string | null {
  if (raw.startsWith('"""') || raw.startsWith("'''")) return null
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1).replaceAll('\\"', '"').replaceAll("\\\\", "\\")
  }
  return raw.length > 0 ? raw : null
}

function unwrapTomlKey(raw: string): string {
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1)
  }
  return raw
}

function uniqueNonEmpty(values: readonly string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const value of values) {
    const trimmed = value.trim()
    if (trimmed.length === 0 || seen.has(trimmed)) continue
    seen.add(trimmed)
    out.push(trimmed)
  }
  return out
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
