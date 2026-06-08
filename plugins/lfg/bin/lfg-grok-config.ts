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
  const modelConfig = upsertModelSections(upsertSection(endpoints, "models", [`default = ${tomlString(discovery.mapping.default)}`]), discovery, baseUrl, options.apiKey)
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

function upsertSection(source: string, section: string, lines: readonly string[]): string {
  const block = `[${section}]\n${lines.join("\n")}\n`
  const pattern = new RegExp(`(^|\\n)\\[${escapeRegExp(section)}\\]\\n[\\s\\S]*?(?=\\n\\[[^\\n]+\\]|$)`)
  if (pattern.test(source)) {
    return source.replace(pattern, (prefix: string) => `${prefix.startsWith("\n") ? "\n" : ""}${block}`)
  }
  const trimmed = source.trimEnd()
  return trimmed.length === 0 ? block : `${trimmed}\n\n${block}`
}

function upsertModelSections(source: string, discovery: ModelDiscovery, baseUrl: string, apiKey: string | undefined): string {
  if (typeof apiKey !== "string" || apiKey.length === 0) {
    return source
  }
  const aliases = modelAliases(discovery)
  let next = source
  for (const alias of aliases) {
    const upstreamModelId = alias === "grok-build" ? discovery.mapping.default : canonicalModelForAlias(discovery.modelIds, alias)
    next = upsertSection(next, modelSectionName(alias), [
      `model = ${tomlString(upstreamModelId)}`,
      `base_url = ${tomlString(baseUrl)}`,
      `api_key = ${tomlString(apiKey)}`,
    ])
  }
  return next
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
