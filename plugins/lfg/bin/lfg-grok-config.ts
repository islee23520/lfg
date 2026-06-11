import { mkdir, readFile, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import type { JsonObject } from "./lfg-json"
import { defaultLazycodexAgentConfig, type LazycodexAgentConfig, type ModelDiscovery } from "./lfg-models"

export type GrokConfigUpdate = {
  readonly status: "configured"
  readonly path: string
  readonly modelsBaseUrl: string
}

export type GrokConfigOptions = {
  readonly home?: string
  readonly apiKey?: string
  readonly agentConfig?: LazycodexAgentConfig
}

/** Sections lfg merges in ~/.grok/config.toml (single writer: runGrokInstall → writeGrokModelConfig). */
export const LFG_OWNED_GROK_CONFIG_SECTIONS = [
  "endpoints.models_base_url",
  "models.default",
  "model.*",
  "lazycodex.models",
  "lazycodex.agents",
] as const

export async function writeGrokModelConfig(discovery: ModelDiscovery, options: GrokConfigOptions = {}): Promise<GrokConfigUpdate> {
  const home = options.home ?? homedir()
  const path = join(home, ".grok", "config.toml")
  const baseUrl = modelsBaseUrl(discovery)
  const current = await readTextIfExists(path)
  const endpoints = removeTomlKey(upsertTomlKey(current, "endpoints", "models_base_url", baseUrl), "endpoints", "api_key")
  const agentConfig = options.agentConfig ?? discovery.agentConfig ?? defaultLazycodexAgentConfig(discovery)
  const modelConfig = upsertModelSections(upsertSection(endpoints, "models", [`default = ${tomlString(discovery.mapping.default)}`]), discovery, baseUrl, options.apiKey, current)
  const next = upsertSection(
    upsertLazycodexAgentSections(modelConfig, agentConfig),
    "lazycodex.models",
    [
      `default = ${tomlString(discovery.mapping.default)}`,
      `fast = ${tomlString(discovery.mapping.fast)}`,
      `reasoning = ${tomlString(discovery.mapping.reasoning)}`,
      `coding = ${tomlString(discovery.mapping.coding)}`,
    ],
  )
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, next, "utf8")
  return { status: "configured", path, modelsBaseUrl: baseUrl }
}

export function grokConfigJson(update: GrokConfigUpdate): JsonObject {
  return {
    status: update.status,
    path: update.path,
    modelsBaseUrl: update.modelsBaseUrl,
  }
}

export type ModelConfigRefreshResult = {
  readonly ok: boolean
  readonly status: "refreshed" | "no_discovery"
  readonly discovery: ModelDiscovery | null
  readonly configUpdate: GrokConfigUpdate | null
  readonly modelsBaseUrl: string | null
}

/**
 * Lightweight refresh of model info + per-model auth into ~/.grok/config.toml.
 * Performs discovery (if provided) and writes lfg-owned sections (endpoints, model.*, lazycodex.models/agents).
 * Does NOT touch the Grok plugin tree, hooks, or agents TOMLs.
 * Context windows are sourced from the discovery (proxy first, then public LiteLLM catalog enrichment, local wins).
 * Per-model api_key lines are written from the provided apiKey (typically OPENAI_API_KEY) when present.
 */
export async function refreshGrokModelConfig(
  discovery: ModelDiscovery | null,
  options: GrokConfigOptions = {},
): Promise<ModelConfigRefreshResult> {
  const home = options.home ?? homedir()
  if (discovery === null) {
    return {
      ok: false,
      status: "no_discovery",
      discovery: null,
      configUpdate: null,
      modelsBaseUrl: null,
    }
  }
  const agentConfig = options.agentConfig ?? discovery.agentConfig ?? defaultLazycodexAgentConfig(discovery)
  const configUpdate = await writeGrokModelConfig(discovery, {
    home,
    apiKey: options.apiKey ?? process.env.OPENAI_API_KEY,
    agentConfig,
  })
  return {
    ok: true,
    status: "refreshed",
    discovery,
    configUpdate,
    modelsBaseUrl: configUpdate.modelsBaseUrl,
  }
}

function modelsBaseUrl(discovery: ModelDiscovery): string {
  return discovery.modelsUrl.endsWith("/models") ? discovery.modelsUrl.slice(0, -"/models".length) : discovery.baseUrl
}

async function readTextIfExists(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8")
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return ""
    }
    throw error
  }
}

function isBareKey(key: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(key)
}

function parseKeyPath(section: string): string[] {
  const parts: string[] = []
  let current = ""
  let inQuotes = false
  for (let i = 0; i < section.length; i++) {
    const char = section[i]
    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === "." && !inQuotes) {
      parts.push(current)
      current = ""
    } else {
      current += char
    }
  }
  if (current.length > 0 || parts.length === 0) {
    parts.push(current)
  }
  return parts
}

function makeKeyPattern(part: string): string {
  const escaped = escapeRegExp(part)
  if (isBareKey(part)) {
    return `(?:"${escaped}"|'${escaped}'|${escaped})`
  }
  return `(?:"${escaped}"|'${escaped}')`
}

function makeSectionRegex(section: string, flags = ""): RegExp {
  const parts = parseKeyPath(section)
  const partPatterns = parts.map(makeKeyPattern)
  const patternStr = `(^|\\n)\\[\\s*${partPatterns.join("\\s*\\.\\s*")}\\s*\\]\\n[\\s\\S]*?(?=\\n\\[[^\\n]+\\]|$)`
  return new RegExp(patternStr, flags)
}

function upsertSection(source: string, section: string, lines: readonly string[]): string {
  const block = `[${section}]\n${lines.join("\n")}\n`
  if (makeSectionRegex(section).test(source)) {
    let replaced = false
    return source.replace(makeSectionRegex(section, "g"), (match: string) => {
      const prefix = match.startsWith("\n") ? "\n" : ""
      if (replaced) {
        return prefix
      }
      replaced = true
      return `${prefix}${block}`
    })
  }
  const trimmed = source.trimEnd()
  return trimmed.length === 0 ? block : `${trimmed}\n\n${block}`
}

function upsertModelSections(
  source: string,
  discovery: ModelDiscovery,
  baseUrl: string,
  apiKey: string | undefined,
  priorConfig: string,
): string {
  const aliases = modelAliases(discovery)
  let next = source
  for (const alias of aliases) {
    const upstreamModelId = alias === "grok-build" ? discovery.mapping.default : canonicalModelForAlias(discovery.modelIds, alias)
    const lines = [
      `model = ${tomlString(upstreamModelId)}`,
      `base_url = ${tomlString(baseUrl)}`,
    ]
    if (typeof apiKey === "string" && apiKey.length > 0) {
      lines.push(`api_key = ${tomlString(apiKey)}`)
    }
    // Per-model context window: fresh discovery wins; if absent in this discovery, preserve prior value from the on-disk config if present.
    const cw = resolveContextWindowForModel(discovery, upstreamModelId, priorConfig, alias)
    if (cw !== null) {
      lines.push(`context_window = ${cw}`)
    }
    next = upsertSection(next, modelSectionName(alias), lines)
  }
  return next
}

function resolveContextWindowForModel(
  discovery: ModelDiscovery,
  upstreamModelId: string,
  priorConfig: string,
  alias: string,
): number | null {
  // 1) Fresh discovery value (exact id or via alias canonicalization)
  const cwMap = discovery.contextWindows
  if (cwMap) {
    const exact = cwMap[upstreamModelId]
    if (typeof exact === "number" && exact > 0) return exact
    // Also try the alias key itself (e.g. "grok-build") if present in the map
    const byAlias = cwMap[alias]
    if (typeof byAlias === "number" && byAlias > 0) return byAlias
  }

  // 2) Preserve prior value from the existing config.toml for this alias section
  const prior = readPriorContextWindow(priorConfig, alias)
  if (prior !== null) return prior

  return null
}

function readPriorContextWindow(source: string, alias: string): number | null {
  const sectionName = modelSectionName(alias)
  // Find the section header
  const header = `[${sectionName}]`
  const start = source.indexOf(header)
  if (start === -1) return null
  const rest = source.slice(start + header.length)
  const next = /\n\[[^\n]+\]/.exec(rest)
  const body = next?.index === undefined ? rest : rest.slice(0, next.index)
  const m = /^\s*context_window\s*=\s*(.+)$/m.exec(body)
  if (!m?.[1]) return null
  const raw = m[1].trim()
  // Accept bare int or quoted int
  const n = raw.startsWith('"') || raw.startsWith("'") ? Number(raw.slice(1, -1)) : Number(raw)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null
}

function modelAliases(discovery: ModelDiscovery): readonly string[] {
  return [...new Set(["grok-build", ...discovery.modelIds])]
}

function canonicalModelForAlias(modelIds: readonly string[], alias: string): string {
  const aliasKey = aliasGroupKey(alias)
  const candidates = modelIds.filter((modelId) => aliasGroupKey(modelId) === aliasKey)
  const exactNormalized = candidates.find((modelId) => modelId === aliasKey)
  if (exactNormalized) {
    return exactNormalized
  }
  const lowercase = candidates.find((modelId) => modelId === modelId.toLowerCase() && !/\s/.test(modelId))
  return lowercase ?? candidates[0] ?? alias
}

function aliasGroupKey(modelId: string): string {
  return modelId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function upsertLazycodexAgentSections(source: string, agentConfig: LazycodexAgentConfig): string {
  return Object.entries(agentConfig).reduce(
    (next, [agentName, setting]) =>
      upsertSection(next, `lazycodex.agents.${agentName}`, [
        `model = ${tomlString(setting.model)}`,
        `reasoning_level = ${tomlString(setting.reasoningLevel)}`,
      ]),
    source,
  )
}

function removeTomlKey(source: string, section: string, key: string): string {
  const header = `[${section}]`
  const start = source.indexOf(header)
  if (start === -1) {
    return source
  }
  const end = nextSectionStart(source, start + header.length)
  const before = source.slice(0, start)
  const body = source.slice(start, end)
  const after = source.slice(end)
  const pattern = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=`, "m")
  const lines = body.split("\n").filter((line) => !pattern.test(line))
  return `${before}${lines.join("\n")}${after}`
}

function upsertTomlKey(source: string, section: string, key: string, value: string): string {
  const header = `[${section}]`
  const start = source.indexOf(header)
  if (start === -1) {
    return upsertSection(source, section, [`${key} = ${tomlString(value)}`])
  }
  const end = nextSectionStart(source, start + header.length)
  const before = source.slice(0, start)
  const body = source.slice(start, end)
  const after = source.slice(end)
  return `${before}${upsertSectionBody(body, key, value)}${after}`
}

function nextSectionStart(source: string, from: number): number {
  const match = /\n\[[^\n]+]/.exec(source.slice(from))
  return match?.index === undefined ? source.length : from + match.index + 1
}

function upsertSectionBody(body: string, key: string, value: string): string {
  const replacement = `${key} = ${tomlString(value)}`
  const pattern = new RegExp(`^${escapeRegExp(key)}\\s*=`)
  const lines = body.split("\n")
  const replaced = lines.map((line) => (pattern.test(line.trimStart()) ? replacement : line))
  if (replaced.includes(replacement)) {
    return replaced.join("\n")
  }
  const insertAt = replaced.length > 0 && replaced[replaced.length - 1] === "" ? replaced.length - 1 : replaced.length
  replaced.splice(insertAt, 0, replacement)
  return replaced.join("\n")
}

function tomlString(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`
}

function modelSectionName(modelId: string): string {
  return `model.${tomlString(modelId)}`
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error
}
