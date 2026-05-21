import { access, cp, readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { resolveLfgEnv, safeChildPath, validateSafeId as validateEnvSafeId, type LfgEnv } from "../foundation/env"
import { APPROVED_MODEL_PROVIDERS as APPROVED_PROVIDER_SET, PROVIDER_DEFAULT_MODELS as MODEL_DEFAULTS } from "../services/model-resolution"

export type JsonPrimitive = null | boolean | number | string
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }
export type JsonRecord = { [key: string]: JsonValue }
export type JsonObject = { [key: string]: unknown }

export type CommandContext = {
  env?: LfgEnv
  now?: () => string
  cwd?: string
  argv0?: string
  processEnv?: NodeJS.ProcessEnv
}

export type ParsedArgs = {
  positional: string[]
  flags: Record<string, string | boolean>
}

export function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = []
  const flags: Record<string, string | boolean> = {}
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (!arg.startsWith("--")) {
      positional.push(arg)
      continue
    }
    const name = arg.slice(2)
    const next = argv[index + 1]
    if (!next || next.startsWith("--")) {
      flags[name] = true
      continue
    }
    flags[name] = next
    index += 1
  }
  return { positional, flags }
}

export function flagString(args: ParsedArgs, name: string): string | undefined {
  const value = args.flags[name]
  return typeof value === "string" ? value : undefined
}

export function flagBoolean(args: ParsedArgs, name: string): boolean {
  return args.flags[name] === true
}

export function utcNow(now?: () => string): string {
  return (now?.() ?? new Date().toISOString()).replace(/\.\d{3}Z$/, "Z")
}

export function commandEnv(context: CommandContext = {}): LfgEnv {
  return context.env ?? resolveLfgEnv({ cwd: context.cwd, env: context.processEnv, argv0: context.argv0 })
}

export const DEFAULT_MODEL_PROVIDER = "openai"
export const APPROVED_MODEL_PROVIDERS = [...APPROVED_PROVIDER_SET].sort()
export const PROVIDER_DEFAULT_MODELS: Record<string, string> = { ...MODEL_DEFAULTS, grok: "xai/grok-4.3" }
export const ENV_NAME_PATTERN = /^[A-Z_][A-Z0-9_]*$/

export function validateSafeId(value: string, field?: string): string {
  return validateEnvSafeId(value, field)
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8")
}

export async function readJson(path: string, fallback: unknown = null): Promise<unknown> {
  try { return JSON.parse(await readFile(path, "utf8")) as unknown } catch { return fallback }
}

export async function readJsonObject(path: string, fallback: JsonObject = {}): Promise<JsonObject> {
  const parsed = await readJson(path, fallback)
  return asRecord(parsed)
}

export async function readJsonRecord(path: string): Promise<JsonRecord | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"))
    return isJsonRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

export async function listJsonIds(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => entry.name.slice(0, -5))
      .sort()
  } catch {
    return []
  }
}

export async function listJsonFiles(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir, { withFileTypes: true })).filter((entry) => entry.isFile() && entry.name.endsWith(".json")).map((entry) => entry.name).sort()
  } catch { return [] }
}

export function stateFile(env: LfgEnv, collection: string, id: string): string {
  return safeChildPath(env.stateDir, collection, `${validateEnvSafeId(id)}.json`)
}

export function stateCollectionDir(env: LfgEnv, collection: string): string {
  return join(env.stateDir, collection)
}

export function isJsonRecord(value: unknown): value is JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  return Object.values(value).every(isJsonValue)
}

export function asRecord(value: unknown): JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as JsonObject : {}
}

export function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}

export function providersPath(env: LfgEnv): string { return join(env.stateDir, "providers.json") }
export function modelSelectionPath(env: LfgEnv): string { return join(env.stateDir, "model-selection.json") }
export function setupPath(env: LfgEnv): string { return join(env.stateDir, "setup.json") }

export async function readProviderState(env: LfgEnv): Promise<JsonObject> {
  const state = { providers: {}, ...await readJsonObject(providersPath(env), {}) }
  const providers = asRecord(state.providers)
  const normalized: JsonObject = {}
  for (const [id, value] of Object.entries(providers)) normalized[id] = normalizeProviderRecord(value)
  return { ...state, providers: normalized }
}

export function normalizeProviderRecord(value: unknown): JsonObject {
  const record = asRecord(value)
  const keys = ["id", "kind", "env", "model", "transport", "authScheme", "secretStored", "addedAt", "updatedAt"]
  const normalized: JsonObject = {}
  for (const key of keys) if (record[key] !== undefined && record[key] !== null) normalized[key] = record[key]
  return normalized
}

export function defaultProviderEnv(kind: string): string {
  const map: Record<string, string> = { openai: "OPENAI_API_KEY", xai: "XAI_API_KEY", grok: "XAI_API_KEY", codex: "CODEX_OAUTH_TOKEN", copilot: "COPILOT_GITHUB_TOKEN", zai: "ZAI_API_KEY", noop: "NOOP_API_KEY", subagent: "XAI_API_KEY" }
  return map[kind] ?? `${kind.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_API_KEY`
}

export function defaultProviderTransport(kind: string): string {
  if (["openai", "xai", "zai"].includes(kind)) return "http"
  if (["grok", "subagent", "noop"].includes(kind)) return "builtin"
  if (kind === "codex") return "cli-oauth"
  return "cli"
}

export function defaultProviderAuthScheme(kind: string): string {
  if (kind === "codex") return "oauth"
  if (["grok", "subagent", "noop"].includes(kind)) return "host"
  return "env"
}

export function ensureMetadataOnlyValue(value: string, field: string): string {
  if (/^(?:sk-[A-Za-z0-9._-]{8,}|gh[pousr]_[A-Za-z0-9_]{8,}|xox[baprs]-[A-Za-z0-9-]{8,}|ya29\.[A-Za-z0-9._-]{8,}|AIza[0-9A-Za-z_-]{10,}|-----BEGIN [A-Z ]+-----|[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})$/.test(value.trim())) throw new Error(`refusing to store secret-like ${field}: [REDACTED]`)
  return value
}

export async function pathExists(path: string): Promise<boolean> {
  try { await access(path); return true } catch { return false }
}

export async function directoryExists(path: string): Promise<boolean> {
  try { return (await stat(path)).isDirectory() } catch { return false }
}

export async function executablePath(name: string): Promise<string | null> {
  return Bun.which(name)
}

export async function copyTree(src: string, dest: string): Promise<void> {
  await cp(src, dest, { recursive: true, force: true })
}

export async function readPluginVersion(env: LfgEnv): Promise<string | null> {
  const manifest = await readJsonObject(join(env.root, ".grok-plugin", "plugin.json"), {})
  return typeof manifest.version === "string" ? manifest.version : null
}

export async function readCatalogSkillCount(env: LfgEnv): Promise<number> {
  const catalog = await readJsonObject(join(env.root, "catalog", "omo-skill-map.json"), {})
  const skills = catalog.skills
  return Array.isArray(skills) ? skills.length : 0
}

export async function detectRepo(cwd?: string): Promise<JsonObject> {
  const root = resolve(cwd ?? process.cwd())
  return { root, isGit: await directoryExists(join(root, ".git")) }
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null) return true
  if (["boolean", "number", "string"].includes(typeof value)) return typeof value !== "number" || Number.isFinite(value)
  if (Array.isArray(value)) return value.every(isJsonValue)
  return isJsonRecord(value)
}
