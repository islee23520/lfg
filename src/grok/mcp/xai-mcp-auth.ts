import { chmod, lstat, mkdir, readFile, unlink, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { isRecord } from "../../shared/json"
import { resolveGrokSetupHome } from "../install/grok-home"

export const XAI_MCP_AUTH_FILE_ENV = "LFG_XAI_MCP_AUTH_FILE" as const
export const XAI_MCP_AUTH_BASENAME = "xai-grok-mcp-auth.json" as const

export const XAI_OAUTH_ISSUER = "https://auth.x.ai" as const
export const XAI_OAUTH_CLIENT_ID = "grok-cli" as const
export const XAI_OAUTH_TOKEN_URL = `${XAI_OAUTH_ISSUER}/oauth2/token` as const

export type XaiMcpAuthMode = "api_key" | "oauth" | "grok_oidc_readonly" | "none"

export type XaiMcpAuthStatus = {
  readonly ok: boolean
  readonly mode: XaiMcpAuthMode
  readonly authFile: string
  readonly expiresAt: string | null
  readonly provider: string | null
  readonly message: string
}

export type XaiMcpPackageAuth = {
  readonly provider: "lfg-xai-mcp" | "xai-oauth"
  readonly access: string
  readonly refresh: string
  readonly expires: number
  readonly tokenEndpoint: string
  readonly tokenType: string
  readonly apiKey?: string
}

export function defaultXaiMcpAuthPath(home: string = resolveGrokSetupHome()): string {
  return join(home, ".grok", XAI_MCP_AUTH_BASENAME)
}

export function resolveXaiMcpAuthPath(env: NodeJS.ProcessEnv = process.env, home?: string): string {
  const explicit = env[XAI_MCP_AUTH_FILE_ENV]?.trim()
  if (explicit !== undefined && explicit.length > 0) {
    return explicit
  }
  return defaultXaiMcpAuthPath(home ?? resolveGrokSetupHome(env))
}

export function grokHostAuthPath(home: string = resolveGrokSetupHome()): string {
  return join(home, ".grok", "auth.json")
}

export async function readXaiMcpPackageAuth(path: string): Promise<XaiMcpPackageAuth | null> {
  let text: string
  try {
    text = await readFile(path, "utf8")
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return null
    }
    throw error
  }
  try {
    const data = JSON.parse(text) as unknown
    if (!isRecord(data)) {
      return null
    }
    if (typeof data.apiKey === "string" && data.apiKey.trim().length > 0) {
      return {
        provider: "lfg-xai-mcp",
        access: data.apiKey.trim(),
        refresh: "",
        expires: Number.MAX_SAFE_INTEGER,
        tokenEndpoint: XAI_OAUTH_TOKEN_URL,
        tokenType: "Bearer",
        apiKey: data.apiKey.trim(),
      }
    }
    if (typeof data.access === "string" && typeof data.refresh === "string" && typeof data.expires === "number") {
      const tokenEndpoint = parseXaiOAuthTokenEndpoint(data.tokenEndpoint)
      if (tokenEndpoint === null) {
        return null
      }
      return {
        provider: "xai-oauth",
        access: data.access,
        refresh: data.refresh,
        expires: data.expires,
        tokenEndpoint,
        tokenType: typeof data.tokenType === "string" ? data.tokenType : "Bearer",
      }
    }
    return null
  } catch {
    return null
  }
}

export async function writeXaiMcpApiKey(path: string, apiKey: string): Promise<void> {
  const trimmed = apiKey.trim()
  if (trimmed.length === 0) {
    throw new Error("API key must be non-empty")
  }
  const body = {
    provider: "lfg-xai-mcp",
    auth_mode: "api_key",
    apiKey: trimmed,
    updated_at: new Date().toISOString(),
  }
  await writeAuthFile(path, JSON.stringify(body, null, 2))
}

export async function writeXaiMcpOAuth(path: string, auth: Omit<XaiMcpPackageAuth, "apiKey">): Promise<void> {
  const access = auth.access.trim()
  const refresh = auth.refresh.trim()
  if (access.length === 0) {
    throw new Error("OAuth access token must be non-empty")
  }
  if (refresh.length === 0) {
    throw new Error("OAuth refresh token must be non-empty")
  }
  if (!Number.isFinite(auth.expires) || auth.expires <= Date.now()) {
    throw new Error("OAuth expiry must be a future timestamp")
  }
  const tokenEndpoint = parseXaiOAuthTokenEndpoint(auth.tokenEndpoint)
  if (tokenEndpoint === null) {
    throw new Error(`OAuth token endpoint must be ${XAI_OAUTH_TOKEN_URL}`)
  }
  const body = {
    provider: auth.provider,
    access,
    refresh,
    expires: auth.expires,
    tokenEndpoint,
    tokenType: auth.tokenType,
    auth_mode: "oauth",
    updated_at: new Date().toISOString(),
  }
  await writeAuthFile(path, JSON.stringify(body, null, 2))
}

export async function clearXaiMcpAuth(path: string): Promise<boolean> {
  try {
    await unlink(path)
    return true
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return false
    }
    throw error
  }
}

export async function getXaiMcpAuthStatus(env: NodeJS.ProcessEnv = process.env): Promise<XaiMcpAuthStatus> {
  const home = resolveGrokSetupHome(env)
  const authFile = resolveXaiMcpAuthPath(env, home)
  const dedicated = await readXaiMcpPackageAuth(authFile)
  if (dedicated !== null) {
    if (dedicated.apiKey !== undefined) {
      return {
        ok: true,
        mode: "api_key",
        authFile,
        expiresAt: null,
        provider: dedicated.provider,
        message: "xai_grok MCP uses dedicated API key (Grok host auth.json is not modified).",
      }
    }
    const expired = dedicated.expires <= Date.now()
    return {
      ok: !expired,
      mode: "oauth",
      authFile,
      expiresAt: new Date(dedicated.expires).toISOString(),
      provider: dedicated.provider,
      message: expired
        ? "Dedicated OAuth tokens expired; run lfg xai auth set-oauth after re-login or use lfg xai auth set-api-key."
        : "xai_grok MCP uses dedicated OAuth store (Grok host auth.json is not modified).",
    }
  }
  const envKey = env.XAI_API_KEY?.trim()
  if (envKey !== undefined && envKey.length > 0) {
    return {
      ok: true,
      mode: "api_key",
      authFile,
      expiresAt: null,
      provider: "env",
      message: "Using XAI_API_KEY from environment (no dedicated file yet).",
    }
  }
  const grokOidc = await readGrokHostOidcForXai(grokHostAuthPath(home))
  if (grokOidc !== null) {
    const expired = grokOidc.expires <= Date.now()
    return {
      ok: !expired,
      mode: "grok_oidc_readonly",
      authFile,
      expiresAt: new Date(grokOidc.expires).toISOString(),
      provider: "grok-oauth",
      message: expired
        ? "No dedicated xAI MCP auth; Grok host OIDC is expired. Use: lfg xai auth set-oauth or lfg xai auth set-api-key"
        : "No dedicated file; falling back to read-only Grok host ~/.grok/auth.json (host file is never written by xai_grok MCP).",
    }
  }
  return {
    ok: false,
    mode: "none",
    authFile,
    expiresAt: null,
    provider: null,
    message: "No xAI credentials. Run: lfg xai auth set-api-key, lfg xai auth set-oauth, or sign in to Grok for read-only fallback.",
  }
}

export async function readGrokHostOidcForXai(
  path: string,
): Promise<{ readonly access: string; readonly refresh: string; readonly expires: number } | null> {
  let text: string
  try {
    text = await readFile(path, "utf8")
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return null
    }
    throw error
  }
  try {
    const data = JSON.parse(text) as unknown
    if (!isRecord(data)) {
      return null
    }
    for (const value of Object.values(data)) {
      if (!isRecord(value)) {
        continue
      }
      if (value.auth_mode !== "oidc" || value.oidc_issuer !== XAI_OAUTH_ISSUER || value.oidc_client_id !== XAI_OAUTH_CLIENT_ID) {
        continue
      }
      const access = typeof value.key === "string" ? value.key : ""
      const refresh = typeof value.refresh_token === "string" ? value.refresh_token : ""
      const expiresAt = typeof value.expires_at === "string" ? Date.parse(value.expires_at) : Number.NaN
      if (access.length > 0 && refresh.length > 0 && !Number.isNaN(expiresAt)) {
        return { access, refresh, expires: expiresAt }
      }
    }
    return null
  } catch {
    return null
  }
}

async function writeAuthFile(path: string, body: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  await rejectUnsafeExistingAuthPath(path)
  await writeFile(path, body, { encoding: "utf8", mode: 0o600 })
  await chmod(path, 0o600)
}

export function parseXaiOAuthTokenEndpoint(value: unknown): typeof XAI_OAUTH_TOKEN_URL | null {
  if (value === undefined || value === null || value === "") {
    return XAI_OAUTH_TOKEN_URL
  }
  return value === XAI_OAUTH_TOKEN_URL ? XAI_OAUTH_TOKEN_URL : null
}

async function rejectUnsafeExistingAuthPath(path: string): Promise<void> {
  try {
    const stat = await lstat(path)
    if (stat.isSymbolicLink()) {
      throw new Error("Refusing to write xAI MCP auth through a symbolic link")
    }
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return
    }
    throw error
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error
}
