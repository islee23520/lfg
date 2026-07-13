import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { DEFAULT_SETUP_MODELS_BASE_URL } from "../install/resolve-setup-discovery"
import { resolveGrokSetupHome } from "../install/grok-home"

/** Well-known local OpenAI-compatible CLI proxy bases (phase COLLECT defaults). */
export const LOCAL_CLI_PROXY_BASE_URL_CANDIDATES = [
  DEFAULT_SETUP_MODELS_BASE_URL, // http://127.0.0.1:8317/v1  (cliproxy family)
  "http://127.0.0.1:20128/v1", // 9router / docker family
] as const

/** Known codex/model-provider family names used by local CLI proxies. */
export const KNOWN_CLI_PROXY_PROVIDER_NAMES = [
  "cliproxyapi",
  "cliproxy",
  "cliproxy-api-plus",
  "cli-proxy",
  "9router",
  "gcli",
] as const

/**
 * Systematic auto-detection algorithm for local CLI-proxy credentials.
 *
 * ```
 * COLLECT  → gather raw candidates from every known source
 * NORMALIZE → strip base URLs, drop invalid, dedupe by (baseUrl + key fingerprint)
 * SCORE    → assign deterministic ranks (source tier + bonuses)
 * PROBE    → optional live GET {baseUrl}/models (short timeout)
 * SELECT   → highest score (prefer live when probe enabled)
 * ```
 */
export type DetectionPhase = "collect" | "normalize" | "score" | "probe" | "select"

export type CredentialSourceClass =
  | "env"
  | "codex_active"
  | "codex_known_family"
  | "codex_loopback"
  | "grok_model"
  | "opencode"
  | "cliproxy_management"
  | "explicit"

export type LocalCliProxyCredential = {
  readonly apiKey: string
  readonly baseUrl: string
  readonly source: string
  readonly sourceClass: CredentialSourceClass
  readonly score: number
  readonly keyFingerprint: string
  readonly probe?: {
    readonly attempted: boolean
    readonly live: boolean
    readonly httpStatus: number | null
    readonly error: string | null
  }
}

export type DetectionCandidateTrace = {
  readonly phase: DetectionPhase
  readonly source: string
  readonly sourceClass: CredentialSourceClass
  readonly baseUrl: string | null
  readonly keyFingerprint: string | null
  readonly score: number | null
  readonly note: string
}

export type LocalCliProxyDetectionReport = {
  readonly ok: boolean
  readonly algorithm: "lfg-xai-cli-proxy-detect/v1"
  readonly phases: readonly DetectionPhase[]
  readonly preferredBaseUrl: string | null
  readonly probeEnabled: boolean
  readonly candidates: readonly LocalCliProxyCredential[]
  readonly selected: LocalCliProxyCredential | null
  readonly traces: readonly DetectionCandidateTrace[]
  readonly message: string
}

export type DetectLocalCliProxyOptions = {
  readonly home?: string
  readonly preferredBaseUrl?: string | null
  /** When true (default), probe candidates with a short /models request. */
  readonly probe?: boolean
  /** Probe timeout ms (default 800). */
  readonly probeTimeoutMs?: number
  /** Optional fetch override for tests. */
  readonly fetchImpl?: typeof fetch
}

/**
 * Full algorithm report (collect → … → select). Use this for diagnostics.
 */
export async function detectLocalCliProxyCredentials(
  env: NodeJS.ProcessEnv = process.env,
  options: DetectLocalCliProxyOptions = {},
): Promise<LocalCliProxyDetectionReport> {
  const home = options.home ?? resolveGrokSetupHome(env)
  const preferred = normalizeBaseUrl(options.preferredBaseUrl)
  const probeEnabled = options.probe !== false
  const probeTimeoutMs = options.probeTimeoutMs ?? 800
  const fetchImpl = options.fetchImpl ?? fetch
  const phases: DetectionPhase[] = ["collect", "normalize", "score", ...(probeEnabled ? (["probe"] as const) : []), "select"]
  const traces: DetectionCandidateTrace[] = []

  // ── Phase 1: COLLECT ──────────────────────────────────────────────
  const raw = await collectCandidates(home, env, preferred, traces)

  // ── Phase 2: NORMALIZE ────────────────────────────────────────────
  const normalized = normalizeCandidates(raw, preferred, traces)

  // ── Phase 3: SCORE ────────────────────────────────────────────────
  const scored = scoreCandidates(normalized, preferred, traces)

  // ── Phase 4: PROBE (optional) ─────────────────────────────────────
  const probed = probeEnabled
    ? await probeCandidates(scored, traces, { fetchImpl, timeoutMs: probeTimeoutMs })
    : scored.map((c) => ({
        ...c,
        probe: { attempted: false, live: false, httpStatus: null, error: null as string | null },
      }))

  // ── Phase 5: SELECT ───────────────────────────────────────────────
  const selected = selectBestCandidate(probed, traces)

  return {
    ok: selected !== null,
    algorithm: "lfg-xai-cli-proxy-detect/v1",
    phases,
    preferredBaseUrl: preferred,
    probeEnabled,
    candidates: probed,
    selected,
    traces,
    message:
      selected === null
        ? "No local CLI proxy credentials found after collect→normalize→score→probe→select."
        : `Selected ${selected.source} → ${selected.baseUrl} (score=${selected.score}${selected.probe?.live ? ", live" : ""}).`,
  }
}

/**
 * Convenience: return the selected credential only (same algorithm as detect*).
 */
export async function resolveLocalCliProxyCredentials(
  env: NodeJS.ProcessEnv = process.env,
  options: DetectLocalCliProxyOptions = {},
): Promise<LocalCliProxyCredential | null> {
  const report = await detectLocalCliProxyCredentials(env, options)
  return report.selected
}

export function isLocalLoopbackBaseUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost" || parsed.hostname === "::1"
  } catch {
    return false
  }
}

export function normalizeBaseUrl(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim().replace(/\/$/, "")
  if (trimmed.length === 0) return null
  return trimmed
}

export function fingerprintApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex").slice(0, 12)
}

// ─── Algorithm phases ───────────────────────────────────────────────────────

type RawCandidate = {
  readonly apiKey: string
  readonly baseUrl: string | null
  readonly source: string
  readonly sourceClass: CredentialSourceClass
}

async function collectCandidates(
  home: string,
  env: NodeJS.ProcessEnv,
  preferred: string | null,
  traces: DetectionCandidateTrace[],
): Promise<RawCandidate[]> {
  const out: RawCandidate[] = []

  const envKey = firstNonEmpty(env.XAI_API_KEY, env.OPENAI_API_KEY)
  if (envKey !== undefined) {
    const baseUrl =
      preferred ??
      normalizeBaseUrl(env.XAI_BASE_URL) ??
      normalizeBaseUrl(env.LFG_GROK_BASE_URL) ??
      normalizeBaseUrl(env.OPENAI_BASE_URL) ??
      (await readGrokEndpointsBaseUrl(home))
    const source = env.XAI_API_KEY?.trim() ? "env:XAI_API_KEY" : "env:OPENAI_API_KEY"
    out.push({ apiKey: envKey, baseUrl, source, sourceClass: "env" })
    traces.push({
      phase: "collect",
      source,
      sourceClass: "env",
      baseUrl,
      keyFingerprint: fingerprintApiKey(envKey),
      score: null,
      note: "collected env API key",
    })
  } else {
    traces.push({
      phase: "collect",
      source: "env",
      sourceClass: "env",
      baseUrl: null,
      keyFingerprint: null,
      score: null,
      note: "no XAI_API_KEY / OPENAI_API_KEY",
    })
  }

  for (const c of await collectCodexProviders(home)) {
    out.push(c)
    traces.push({
      phase: "collect",
      source: c.source,
      sourceClass: c.sourceClass,
      baseUrl: c.baseUrl,
      keyFingerprint: fingerprintApiKey(c.apiKey),
      score: null,
      note: "collected codex model_provider",
    })
  }

  for (const c of await collectGrokModelSections(home)) {
    out.push(c)
    traces.push({
      phase: "collect",
      source: c.source,
      sourceClass: c.sourceClass,
      baseUrl: c.baseUrl,
      keyFingerprint: fingerprintApiKey(c.apiKey),
      score: null,
      note: "collected grok [model.*] local pair",
    })
  }

  const opencode = await readOpencodeCliproxyAuth(home)
  if (opencode !== null) {
    out.push({
      apiKey: opencode,
      baseUrl: preferred ?? DEFAULT_SETUP_MODELS_BASE_URL,
      source: "opencode:cliproxy/auth.json",
      sourceClass: "opencode",
    })
    traces.push({
      phase: "collect",
      source: "opencode:cliproxy/auth.json",
      sourceClass: "opencode",
      baseUrl: preferred ?? DEFAULT_SETUP_MODELS_BASE_URL,
      keyFingerprint: fingerprintApiKey(opencode),
      score: null,
      note: "collected opencode cliproxy auth",
    })
  } else {
    traces.push({
      phase: "collect",
      source: "opencode:cliproxy/auth.json",
      sourceClass: "opencode",
      baseUrl: null,
      keyFingerprint: null,
      score: null,
      note: "not found",
    })
  }

  const management = await readCliproxyApiPlusManagementKey(home)
  if (management !== null) {
    out.push({
      apiKey: management,
      baseUrl: preferred ?? DEFAULT_SETUP_MODELS_BASE_URL,
      source: "cliproxy-api-plus:management-key",
      sourceClass: "cliproxy_management",
    })
    traces.push({
      phase: "collect",
      source: "cliproxy-api-plus:management-key",
      sourceClass: "cliproxy_management",
      baseUrl: preferred ?? DEFAULT_SETUP_MODELS_BASE_URL,
      keyFingerprint: fingerprintApiKey(management),
      score: null,
      note: "collected cliproxy-api-plus management key",
    })
  } else {
    traces.push({
      phase: "collect",
      source: "cliproxy-api-plus:management-key",
      sourceClass: "cliproxy_management",
      baseUrl: null,
      keyFingerprint: null,
      score: null,
      note: "not found",
    })
  }

  return out
}

function normalizeCandidates(
  raw: readonly RawCandidate[],
  preferred: string | null,
  traces: DetectionCandidateTrace[],
): Array<RawCandidate & { baseUrl: string }> {
  const seen = new Set<string>()
  const out: Array<RawCandidate & { baseUrl: string }> = []

  for (const c of raw) {
    const baseUrl = normalizeBaseUrl(c.baseUrl) ?? preferred ?? DEFAULT_SETUP_MODELS_BASE_URL
    if (c.apiKey.trim().length === 0) {
      traces.push({
        phase: "normalize",
        source: c.source,
        sourceClass: c.sourceClass,
        baseUrl,
        keyFingerprint: null,
        score: null,
        note: "dropped: empty api key",
      })
      continue
    }
    try {
      void new URL(baseUrl)
    } catch {
      traces.push({
        phase: "normalize",
        source: c.source,
        sourceClass: c.sourceClass,
        baseUrl,
        keyFingerprint: fingerprintApiKey(c.apiKey),
        score: null,
        note: "dropped: invalid base URL",
      })
      continue
    }
    const fp = fingerprintApiKey(c.apiKey)
    const dedupeKey = `${baseUrl}::${fp}`
    if (seen.has(dedupeKey)) {
      traces.push({
        phase: "normalize",
        source: c.source,
        sourceClass: c.sourceClass,
        baseUrl,
        keyFingerprint: fp,
        score: null,
        note: "dropped: duplicate (baseUrl+key fingerprint)",
      })
      continue
    }
    seen.add(dedupeKey)
    out.push({ ...c, baseUrl })
    traces.push({
      phase: "normalize",
      source: c.source,
      sourceClass: c.sourceClass,
      baseUrl,
      keyFingerprint: fp,
      score: null,
      note: "kept",
    })
  }
  return out
}

function scoreCandidates(
  candidates: readonly (RawCandidate & { baseUrl: string })[],
  preferred: string | null,
  traces: DetectionCandidateTrace[],
): LocalCliProxyCredential[] {
  return candidates
    .map((c) => {
      let score = sourceClassBaseScore(c.sourceClass)
      if (preferred !== null && c.baseUrl === preferred) score += 20
      if (isKnownFamilySource(c.source)) score += 15
      if (isLocalLoopbackBaseUrl(c.baseUrl)) score += 10
      if (c.baseUrl !== DEFAULT_SETUP_MODELS_BASE_URL || c.sourceClass !== "opencode") {
        // slight preference when base came from same source rather than only a default fallback
        if (c.source.includes("model_providers") || c.source.includes("[model.")) score += 5
      }
      const cred: LocalCliProxyCredential = {
        apiKey: c.apiKey,
        baseUrl: c.baseUrl,
        source: c.source,
        sourceClass: c.sourceClass,
        score,
        keyFingerprint: fingerprintApiKey(c.apiKey),
      }
      traces.push({
        phase: "score",
        source: c.source,
        sourceClass: c.sourceClass,
        baseUrl: c.baseUrl,
        keyFingerprint: cred.keyFingerprint,
        score,
        note: `tier=${c.sourceClass}`,
      })
      return cred
    })
    .sort((a, b) => b.score - a.score || a.source.localeCompare(b.source))
}

async function probeCandidates(
  candidates: readonly LocalCliProxyCredential[],
  traces: DetectionCandidateTrace[],
  options: { readonly fetchImpl: typeof fetch; readonly timeoutMs: number },
): Promise<LocalCliProxyCredential[]> {
  const results: LocalCliProxyCredential[] = []
  for (const c of candidates) {
    const probe = await probeBaseUrl(c.baseUrl, c.apiKey, options)
    const liveBonus = probe.live ? (probe.httpStatus !== null && probe.httpStatus < 400 ? 40 : 25) : 0
    const deadPenalty = probe.attempted && !probe.live ? -50 : 0
    const score = c.score + liveBonus + deadPenalty
    const next: LocalCliProxyCredential = {
      ...c,
      score,
      probe,
    }
    results.push(next)
    traces.push({
      phase: "probe",
      source: c.source,
      sourceClass: c.sourceClass,
      baseUrl: c.baseUrl,
      keyFingerprint: c.keyFingerprint,
      score,
      note: probe.live
        ? `live http=${probe.httpStatus ?? "?"} +${liveBonus}`
        : `not live${probe.error ? `: ${probe.error}` : ""} ${deadPenalty}`,
    })
  }
  return results.sort((a, b) => b.score - a.score || a.source.localeCompare(b.source))
}

function selectBestCandidate(
  candidates: readonly LocalCliProxyCredential[],
  traces: DetectionCandidateTrace[],
): LocalCliProxyCredential | null {
  if (candidates.length === 0) {
    traces.push({
      phase: "select",
      source: "(none)",
      sourceClass: "explicit",
      baseUrl: null,
      keyFingerprint: null,
      score: null,
      note: "no candidates",
    })
    return null
  }

  // Prefer live when any probe succeeded; otherwise highest score.
  const live = candidates.filter((c) => c.probe?.live === true)
  const pool = live.length > 0 ? live : candidates
  const selected = pool[0] ?? null
  if (selected !== null) {
    traces.push({
      phase: "select",
      source: selected.source,
      sourceClass: selected.sourceClass,
      baseUrl: selected.baseUrl,
      keyFingerprint: selected.keyFingerprint,
      score: selected.score,
      note: live.length > 0 ? "selected highest-score live candidate" : "selected highest-score candidate (no live probes)",
    })
  }
  return selected
}

function sourceClassBaseScore(sourceClass: CredentialSourceClass): number {
  switch (sourceClass) {
    case "env":
      return 100
    case "codex_active":
      return 90
    case "codex_known_family":
      return 80
    case "grok_model":
      return 75
    case "codex_loopback":
      return 70
    case "opencode":
      return 60
    case "cliproxy_management":
      return 50
    case "explicit":
      return 110
    default:
      return 10
  }
}

function isKnownFamilySource(source: string): boolean {
  const lower = source.toLowerCase()
  return KNOWN_CLI_PROXY_PROVIDER_NAMES.some((name) => lower.includes(name))
}

async function probeBaseUrl(
  baseUrl: string,
  apiKey: string,
  options: { readonly fetchImpl: typeof fetch; readonly timeoutMs: number },
): Promise<{ attempted: boolean; live: boolean; httpStatus: number | null; error: string | null }> {
  const modelsUrl = baseUrl.endsWith("/models") ? baseUrl : `${baseUrl.replace(/\/$/, "")}/models`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs)
  try {
    const response = await options.fetchImpl(modelsUrl, {
      method: "GET",
      headers: {
        authorization: `Bearer ${apiKey}`,
        accept: "application/json",
        "user-agent": "lfg-xai-cli-proxy-detect/1",
      },
      signal: controller.signal,
    })
    // Any HTTP response means the proxy is listening (even 401/403).
    const live = response.status > 0 && response.status < 600
    return { attempted: true, live, httpStatus: response.status, error: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { attempted: true, live: false, httpStatus: null, error: message.slice(0, 120) }
  } finally {
    clearTimeout(timer)
  }
}

// ─── Source collectors ──────────────────────────────────────────────────────

async function collectCodexProviders(home: string): Promise<RawCandidate[]> {
  let text: string
  try {
    text = await readFile(join(home, ".codex", "config.toml"), "utf8")
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return []
    throw error
  }

  const out: RawCandidate[] = []
  const active = readTopLevelTomlString(text, "model_provider")
  const names = listTomlSections(text, "model_providers")
  for (const name of names) {
    const cred = readCodexProviderCredential(text, name)
    if (cred === null) continue
    const isActive = active === name
    const isKnown = (KNOWN_CLI_PROXY_PROVIDER_NAMES as readonly string[]).includes(name.toLowerCase())
    const isLoopback = cred.baseUrl !== null && isLocalLoopbackBaseUrl(cred.baseUrl)
    if (!isActive && !isKnown && !isLoopback) continue
    const sourceClass: CredentialSourceClass = isActive
      ? "codex_active"
      : isKnown
        ? "codex_known_family"
        : "codex_loopback"
    out.push({
      apiKey: cred.apiKey,
      baseUrl: cred.baseUrl,
      source: `codex:model_providers.${name}`,
      sourceClass,
    })
  }
  return out
}

function readCodexProviderCredential(
  config: string,
  provider: string,
): { readonly apiKey: string; readonly baseUrl: string | null } | null {
  const section = readTomlSection(config, `model_providers.${provider}`)
  if (section === null) return null
  const apiKey = firstNonEmpty(
    readTomlString(section, "experimental_bearer_token"),
    readTomlString(section, "api_key"),
  )
  if (apiKey === undefined) return null
  const baseUrl = normalizeBaseUrl(readTomlString(section, "base_url"))
  return { apiKey, baseUrl }
}

async function collectGrokModelSections(home: string): Promise<RawCandidate[]> {
  let text: string
  try {
    text = await readFile(join(home, ".grok", "config.toml"), "utf8")
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return []
    throw error
  }

  const out: RawCandidate[] = []
  const sectionPattern = /(?:^|\n)\[(model(?:\.[^\]]+)?)\]\n([\s\S]*?)(?=\n\[[^\n]+\]|$)/g
  let match: RegExpExecArray | null
  while ((match = sectionPattern.exec(text)) !== null) {
    const sectionName = match[1] ?? "model"
    const body = match[2] ?? ""
    const baseUrl = normalizeBaseUrl(readTomlString(body, "base_url"))
    const apiKey = firstNonEmpty(readTomlString(body, "api_key"), readTomlString(body, "experimental_bearer_token"))
    if (baseUrl === null || apiKey === undefined) continue
    if (!isLocalLoopbackBaseUrl(baseUrl)) continue
    out.push({
      apiKey,
      baseUrl,
      source: `grok:config.toml [${sectionName}]`,
      sourceClass: "grok_model",
    })
  }
  return out
}

async function readGrokEndpointsBaseUrl(home: string): Promise<string | null> {
  try {
    const text = await readFile(join(home, ".grok", "config.toml"), "utf8")
    const section = readTomlSection(text, "endpoints")
    if (section === null) return null
    return normalizeBaseUrl(readTomlString(section, "models_base_url"))
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return null
    throw error
  }
}

async function readOpencodeCliproxyAuth(home: string): Promise<string | null> {
  const candidates = [
    join(home, ".config", "opencode", "cliproxy", "auth.json"),
    join(home, ".config", "opencode", "auth.json"),
  ]
  for (const path of candidates) {
    try {
      const raw = JSON.parse(await readFile(path, "utf8")) as unknown
      if (typeof raw === "object" && raw !== null) {
        const record = raw as Record<string, unknown>
        const key = firstNonEmpty(
          typeof record.apiKey === "string" ? record.apiKey : undefined,
          typeof record.api_key === "string" ? record.api_key : undefined,
          typeof record.token === "string" ? record.token : undefined,
        )
        if (key !== undefined) return key
      }
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") continue
    }
  }
  return null
}

async function readCliproxyApiPlusManagementKey(home: string): Promise<string | null> {
  try {
    const text = (await readFile(join(home, ".config", "cliproxy-api-plus", "management-key"), "utf8")).trim()
    return text.length > 0 ? text : null
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return null
    throw error
  }
}

// ─── TOML helpers ───────────────────────────────────────────────────────────

function listTomlSections(source: string, prefix: string): string[] {
  const names: string[] = []
  const pattern = /(?:^|\n)\[([^\]]+)\]/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(source)) !== null) {
    const full = (match[1] ?? "").trim()
    if (!full.startsWith(`${prefix}.`)) continue
    let name = full.slice(prefix.length + 1).trim()
    if ((name.startsWith('"') && name.endsWith('"')) || (name.startsWith("'") && name.endsWith("'"))) {
      name = name.slice(1, -1)
    }
    if (name.length > 0) names.push(name)
  }
  return names
}

function readTopLevelTomlString(source: string, key: string): string | undefined {
  const firstSection = source.search(/^\s*\[[^\n]+]/m)
  const topLevel = firstSection === -1 ? source : source.slice(0, firstSection)
  return readTomlString(topLevel, key)
}

function readTomlString(source: string, key: string): string | undefined {
  const pattern = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*(["'])(.*?)\\1\\s*$`, "m")
  return pattern.exec(source)?.[2]
}

function readTomlSection(source: string, section: string): string | null {
  const parts = section.split(".").map((part) => {
    const escaped = escapeRegExp(part)
    return /^[A-Za-z0-9_-]+$/.test(part) ? `(?:"${escaped}"|'${escaped}'|${escaped})` : `(?:"${escaped}"|'${escaped}')`
  })
  const pattern = new RegExp(`(?:^|\\n)\\[\\s*${parts.join("\\s*\\.\\s*")}\\s*\\]\\n([\\s\\S]*?)(?=\\n\\[[^\\n]+\\]|$)`)
  return pattern.exec(source)?.[1] ?? null
}

function firstNonEmpty(...values: readonly (string | undefined)[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) return value.trim()
  }
  return undefined
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error
}
