#!/usr/bin/env node
import { createInterface } from "node:readline"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs"
import { stdin, stdout } from "node:process"

const RUNTIME_NAME = "lfg-xai-grok"
const VERSION = "0.0.0"
const XAI_BASE_URL = (process.env.XAI_BASE_URL || "https://api.x.ai/v1").replace(/\/$/, "")
const XAI_OAUTH_ISSUER = "https://auth.x.ai"
const XAI_OAUTH_CLIENT_ID = "grok-cli"
const XAI_OAUTH_TOKEN_URL = `${XAI_OAUTH_ISSUER}/oauth2/token`
const REFRESH_SKEW_MS = 2 * 60 * 1000
const MAX_BODY_BYTES = 50 * 1024 * 1024

const tools = [
  {
    name: "xai_generate_text",
    description: "Generate text with xAI Grok through the Responses API.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        prompt: { type: "string", minLength: 1 },
        model: { type: "string" },
        reasoning_effort: { type: "string", enum: ["low", "medium", "high"] },
      },
      required: ["prompt"],
    },
  },
  {
    name: "xai_web_search",
    description: "Search the web using xAI/Grok native server-side web_search through the Responses API.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        prompt: { type: "string", minLength: 1 },
        query: { type: "string", minLength: 1 },
        model: { type: "string" },
      },
    },
  },
  {
    name: "xai_x_search",
    description: "Search X/Twitter posts, profiles, and threads using xAI server-side x_search through the Responses API.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        prompt: { type: "string", minLength: 1 },
        query: { type: "string", minLength: 1 },
        allowed_x_handles: { type: "array", items: { type: "string" }, maxItems: 10 },
        excluded_x_handles: { type: "array", items: { type: "string" }, maxItems: 10 },
        from_date: { type: "string" },
        to_date: { type: "string" },
        enable_image_understanding: { type: "boolean" },
        enable_video_understanding: { type: "boolean" },
        model: { type: "string" },
      },
    },
  },
  {
    name: "xai_image_generate",
    description: "Generate images with xAI's image generation endpoint. Returns upstream JSON.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        prompt: { type: "string", minLength: 1 },
        model: { type: "string" },
        n: { type: "integer", minimum: 1, maximum: 10 },
        size: { type: "string" },
        resolution: { type: "string", enum: ["1k", "2k"] },
        response_format: { type: "string", enum: ["url", "b64_json"] },
      },
      required: ["prompt"],
    },
  },
  {
    name: "xai_tts",
    description: "Generate speech audio with xAI's text-to-speech endpoint. Returns base64 audio.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        input: { type: "string", minLength: 1 },
        voice: { type: "string" },
        voice_id: { type: "string" },
        language: { type: "string" },
        format: { type: "string" },
        codec: { type: "string" },
        sample_rate: { type: "integer" },
        bit_rate: { type: "integer" },
        text_normalization: { type: "boolean" },
      },
      required: ["input"],
    },
  },
  {
    name: "xai_video_generate",
    description: "Generate videos with xAI Grok Imagine. Supports text-to-video, image-to-video, and reference images.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        prompt: { type: "string", minLength: 1 },
        model: { type: "string" },
        duration: { type: "integer", minimum: 1, maximum: 15 },
        aspect_ratio: { type: "string" },
        resolution: { type: "string", enum: ["480p", "720p"] },
        image_url: { type: "string" },
        reference_image_urls: { type: "array", items: { type: "string" }, maxItems: 7 },
      },
      required: ["prompt"],
    },
  },
  {
    name: "xai_auth_status",
    description: "Inspect xAI MCP credential status without revealing tokens.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
  },
  {
    name: "xai_auth_set_api_key",
    description:
      "Save a dedicated xAI API key for this MCP runtime. Optional base_url targets a local CLI proxy (OpenAI-compatible). Does not modify Grok host auth.json.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        api_key: { type: "string", minLength: 1 },
        base_url: { type: "string", minLength: 1, description: "Optional OpenAI-compatible base URL (e.g. http://127.0.0.1:8317/v1)" },
      },
      required: ["api_key"],
    },
  },
  {
    name: "xai_auth_set_oauth",
    description: "Save dedicated xAI OAuth tokens for this MCP runtime. Does not modify Grok host auth.json.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        access_token: { type: "string", minLength: 1 },
        refresh_token: { type: "string", minLength: 1 },
        expires_at: { type: "string" },
        expires_in: { type: "number", minimum: 1 },
        token_endpoint: { type: "string" },
        token_type: { type: "string" },
      },
      required: ["access_token", "refresh_token"],
    },
  },
  {
    name: "xai_auth_refresh",
    description: "Refresh the dedicated xAI OAuth credentials and store the refreshed tokens.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
  },
  {
    name: "xai_auth_logout",
    description: "Remove the dedicated xAI MCP credential file. Does not modify Grok host auth.json.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
  },
]

const cliCommand = process.argv[2]
if (cliCommand === "auth") {
  process.stderr.write("Use lfg xai auth to configure xai_grok MCP credentials.\n")
  process.exit(2)
}
if (cliCommand !== "mcp") {
  process.stderr.write("lfg xai runtime supports the mcp subcommand (auth via lfg xai auth)\n")
  process.exit(2)
}
if (stdin.isTTY) process.exit(0)

const pendingRequests = new Set()
let stdinClosed = false
const rl = createInterface({ input: stdin, crlfDelay: Infinity })
rl.on("line", (line) => {
  if (line.trim().length === 0) return
  const pending = handleLine(line).finally(() => {
    pendingRequests.delete(pending)
    exitWhenIdle()
  })
  pendingRequests.add(pending)
})
rl.on("close", () => {
  stdinClosed = true
  exitWhenIdle()
})

function exitWhenIdle() {
  if (stdinClosed && pendingRequests.size === 0) process.exit(0)
}

async function handleLine(line) {
  let request
  try {
    request = JSON.parse(line)
  } catch {
    return
  }
  if (!request || typeof request !== "object" || !("id" in request)) return
  try {
    if (request.method === "initialize") {
      writeResult(request.id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: RUNTIME_NAME, version: VERSION },
      })
      return
    }
    if (request.method === "tools/list") {
      writeResult(request.id, { tools })
      return
    }
    if (request.method === "tools/call") {
      const result = await callTool(request.params)
      writeResult(request.id, result)
      return
    }
    writeError(request.id, -32601, "Method not found")
  } catch (error) {
    writeError(request.id, -32000, error instanceof Error ? error.message : String(error))
  }
}

async function callTool(params) {
  if (!params || typeof params !== "object") throw new Error("tools/call params must be an object")
  const name = typeof params.name === "string" ? params.name : ""
  const args = params.arguments && typeof params.arguments === "object" ? params.arguments : {}
  switch (name) {
    case "xai_generate_text":
      return textJson(await xaiResponses({ prompt: requiredString(args.prompt, "prompt"), model: optionalString(args.model), reasoningEffort: optionalString(args.reasoning_effort) }))
    case "xai_web_search":
      return textJson(await xaiResponses({ prompt: promptOrQuery(args), model: optionalString(args.model), tools: [{ type: "web_search" }] }))
    case "xai_x_search":
      return textJson(await xaiResponses({ prompt: promptOrQuery(args), model: optionalString(args.model) || "grok-4.3", tools: [xSearchTool(args)] }))
    case "xai_image_generate":
      return textJson(await xaiJsonPost("/images/generations", compact({ prompt: requiredString(args.prompt, "prompt"), model: optionalString(args.model) || "grok-imagine-image", n: optionalNumber(args.n), size: optionalString(args.size), resolution: optionalString(args.resolution), response_format: optionalString(args.response_format) })))
    case "xai_tts":
      return textJson(await xaiAudioPost("/audio/speech", compact({ input: requiredString(args.input, "input"), voice: optionalString(args.voice), voice_id: optionalString(args.voice_id), language: optionalString(args.language), format: optionalString(args.format), codec: optionalString(args.codec), sample_rate: optionalNumber(args.sample_rate), bit_rate: optionalNumber(args.bit_rate), text_normalization: optionalBoolean(args.text_normalization) })))
    case "xai_video_generate":
      return textJson(await xaiJsonPost("/videos/generations", compact({ prompt: requiredString(args.prompt, "prompt"), model: optionalString(args.model) || "grok-imagine-video", duration: optionalNumber(args.duration), aspect_ratio: optionalString(args.aspect_ratio), resolution: optionalString(args.resolution), image_url: optionalString(args.image_url), reference_image_urls: optionalStringArray(args.reference_image_urls) })))
    case "xai_auth_status":
      return textJson(xaiAuthStatus())
    case "xai_auth_set_api_key":
      return textJson(xaiAuthSetApiKey(args))
    case "xai_auth_set_oauth":
      return textJson(xaiAuthSetOAuth(args))
    case "xai_auth_refresh":
      return textJson(await xaiAuthRefresh())
    case "xai_auth_logout":
      return textJson(xaiAuthLogout())
    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}

function xaiAuthStatus() {
  const path = dedicatedAuthPath()
  const dedicated = readDedicatedMcpAuth(path)
  if (dedicated) {
    const isApiKey = dedicated.refresh.length === 0
    const expired = !isApiKey && dedicated.expires <= Date.now()
    return {
      ok: isApiKey || !expired,
      status: "xai_auth_status",
      mode: isApiKey ? "api_key" : "oauth",
      authFile: path,
      expiresAt: isApiKey ? null : new Date(dedicated.expires).toISOString(),
      provider: dedicated.provider,
      grokHostAuthUntouched: true,
      message: expired ? "Dedicated OAuth tokens are expired." : "Using dedicated xAI MCP credentials.",
    }
  }
  const apiKey = (process.env.XAI_API_KEY || "").trim()
  if (apiKey.length > 0) {
    return {
      ok: true,
      status: "xai_auth_status",
      mode: "api_key",
      authFile: path,
      expiresAt: null,
      provider: "env",
      grokHostAuthUntouched: true,
      message: "Using XAI_API_KEY from environment.",
    }
  }
  const grokOidc = readGrokStoredAuth(grokHostAuthPath())
  if (grokOidc) {
    const expired = grokOidc.expires <= Date.now()
    return {
      ok: !expired,
      status: "xai_auth_status",
      mode: "grok_oidc_readonly",
      authFile: path,
      expiresAt: new Date(grokOidc.expires).toISOString(),
      provider: "grok-oauth",
      grokHostAuthUntouched: true,
      message: expired ? "Grok host OIDC fallback is expired." : "Using read-only Grok host OIDC fallback.",
    }
  }
  return {
    ok: false,
    status: "xai_auth_status",
    mode: "none",
    authFile: path,
    expiresAt: null,
    provider: null,
    grokHostAuthUntouched: true,
    message: "No xAI credentials configured.",
  }
}

function xaiAuthSetApiKey(args) {
  const apiKey = requiredString(args.api_key, "api_key").trim()
  const baseUrlArg = typeof args.base_url === "string" ? args.base_url.trim().replace(/\/$/, "") : ""
  writeDedicatedMcpAuth({
    provider: "lfg-xai-mcp",
    access: apiKey,
    refresh: "",
    expires: Number.MAX_SAFE_INTEGER,
    tokenEndpoint: XAI_OAUTH_TOKEN_URL,
    tokenType: "Bearer",
    ...(baseUrlArg ? { baseUrl: baseUrlArg } : {}),
  })
  return {
    ok: true,
    status: "xai_auth_saved",
    mode: "api_key",
    authFile: dedicatedAuthPath(),
    grokHostAuthUntouched: true,
    message: "Saved API key to dedicated xai_grok MCP auth file.",
  }
}

function xaiAuthSetOAuth(args) {
  const access = requiredString(args.access_token, "access_token").trim()
  const refresh = requiredString(args.refresh_token, "refresh_token").trim()
  const expires = oauthExpiryFromArgs(args)
  if (expires === undefined) throw new Error("xai_auth_set_oauth requires a future expires_at or positive expires_in")
  writeDedicatedMcpAuth({
    provider: "xai-oauth",
    access,
    refresh,
    expires,
    tokenEndpoint: parseXaiOAuthTokenEndpoint(optionalString(args.token_endpoint)),
    tokenType: optionalString(args.token_type) || "Bearer",
  })
  return {
    ok: true,
    status: "xai_oauth_saved",
    mode: "oauth",
    authFile: dedicatedAuthPath(),
    expiresAt: new Date(expires).toISOString(),
    grokHostAuthUntouched: true,
    message: "Saved OAuth tokens to dedicated xai_grok MCP auth file.",
  }
}

async function xaiAuthRefresh() {
  const path = dedicatedAuthPath()
  const dedicated = readDedicatedMcpAuth(path)
  if (!dedicated || dedicated.refresh.length === 0) throw new Error("Dedicated OAuth credentials not found")
  const refreshed = await refreshStoredAuth(dedicated)
  return {
    ok: true,
    status: "xai_oauth_refreshed",
    mode: "oauth",
    authFile: path,
    expiresAt: new Date(refreshed.expires).toISOString(),
    grokHostAuthUntouched: true,
    message: "Refreshed dedicated xAI OAuth credentials.",
  }
}

function xaiAuthLogout() {
  const path = dedicatedAuthPath()
  const removed = unlinkIfExists(path)
  return {
    ok: true,
    status: "xai_auth_cleared",
    authFile: path,
    removed,
    grokHostAuthUntouched: true,
    message: removed ? "Removed dedicated xai_grok MCP credentials." : "No dedicated xai_grok MCP credentials to remove.",
  }
}

function xSearchTool(args) {
  const allowed = optionalStringArray(args.allowed_x_handles) || []
  const excluded = optionalStringArray(args.excluded_x_handles) || []
  if (allowed.length > 0 && excluded.length > 0) throw new Error("allowed_x_handles and excluded_x_handles cannot be used together")
  return compact({ type: "x_search", allowed_x_handles: allowed.length ? allowed : undefined, excluded_x_handles: excluded.length ? excluded : undefined, from_date: optionalString(args.from_date), to_date: optionalString(args.to_date), enable_image_understanding: optionalBoolean(args.enable_image_understanding), enable_video_understanding: optionalBoolean(args.enable_video_understanding) })
}

async function xaiResponses(input) {
  const body = compact({
    model: input.model || "grok-4.3",
    input: input.prompt,
    reasoning: input.reasoningEffort ? { effort: input.reasoningEffort } : undefined,
    tools: input.tools,
  })
  const data = await xaiJsonPost("/responses", body)
  return {
    text: extractResponseText(data),
    citations: extractCitations(data),
    inline_citations: extractInlineCitations(data),
    raw: data,
  }
}

async function xaiJsonPost(path, body) {
  const response = await xaiFetch(path, { headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body) })
  const text = await response.text()
  if (!response.ok) throw new Error(`xAI ${path} failed: ${response.status} ${redact(text)}`)
  return text.length ? JSON.parse(text) : {}
}

async function xaiAudioPost(path, body) {
  const response = await xaiFetch(path, { headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
  const buffer = Buffer.from(await response.arrayBuffer())
  if (!response.ok) throw new Error(`xAI ${path} failed: ${response.status} ${redact(buffer.toString("utf8"))}`)
  if (buffer.byteLength > MAX_BODY_BYTES) throw new Error("xAI audio response exceeded maximum supported size")
  return {
    content_type: response.headers.get("content-type") || "application/octet-stream",
    audio_base64: buffer.toString("base64"),
  }
}

async function xaiFetch(path, init) {
  const creds = await resolveXaiCredentials()
  return fetch(`${creds.baseUrl}${path}`, { method: "POST", ...init, headers: { ...init.headers, authorization: `Bearer ${creds.apiKey}`, "user-agent": "lfg-xai-grok-mcp/0.0.0" } })
}

const LFG_XAI_MCP_AUTH_BASENAME = "xai-grok-mcp-auth.json"
const DEDICATED_AUTH_ENV = "LFG_XAI_MCP_AUTH_FILE"

function dedicatedAuthPath() {
  const explicit = (process.env[DEDICATED_AUTH_ENV] || "").trim()
  if (explicit) return explicit
  return join(homedir(), ".grok", LFG_XAI_MCP_AUTH_BASENAME)
}

function grokHostAuthPath() {
  return join(homedir(), ".grok", "auth.json")
}

function legacyAuthPath() {
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "codex-xai-oauth", "auth.json")
}

async function resolveXaiCredentials() {
  const dedicated = readDedicatedMcpAuth(dedicatedAuthPath())
  if (dedicated && dedicated.access) {
    const current =
      dedicated.refresh &&
      (dedicated.expires - Date.now() <= REFRESH_SKEW_MS || accessTokenIsExpiring(dedicated.access))
        ? await refreshStoredAuth(dedicated)
        : dedicated
    const baseUrl = normalizeBaseUrl(current.baseUrl) || XAI_BASE_URL
    return { provider: current.provider, apiKey: current.access, baseUrl }
  }
  const apiKey = (process.env.XAI_API_KEY || "").trim()
  if (apiKey) {
    const envBase = normalizeBaseUrl(process.env.XAI_BASE_URL) || XAI_BASE_URL
    return { provider: "xai", apiKey, baseUrl: envBase }
  }
  const grokOidc = readGrokStoredAuth(grokHostAuthPath())
  if (grokOidc && grokOidc.access) {
    if (grokOidc.expires - Date.now() <= REFRESH_SKEW_MS || accessTokenIsExpiring(grokOidc.access)) {
      throw new Error("Grok host OIDC fallback is expired or near expiry. Configure dedicated xAI MCP auth with lfg xai auth set-oauth or set-api-key.")
    }
    return { provider: grokOidc.provider, apiKey: grokOidc.access, baseUrl: XAI_BASE_URL }
  }
  throw new Error(
    "xAI credentials not found. Run: lfg xai auth set-api-key (auto local CLI proxy), lfg xai auth set-oauth, set XAI_API_KEY, or sign in to Grok for read-only host fallback.",
  )
}

function normalizeBaseUrl(value) {
  if (typeof value !== "string") return ""
  return value.trim().replace(/\/$/, "")
}

async function refreshStoredAuth(auth) {
  const tokenEndpoint = parseXaiOAuthTokenEndpoint(auth.tokenEndpoint)
  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "lfg-xai-grok-mcp/0.0.0" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: XAI_OAUTH_CLIENT_ID,
      refresh_token: auth.refresh,
    }),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || !data.access_token) throw new Error("xAI OAuth refresh failed")
  const refreshed = {
    provider: auth.provider === "grok-oauth" ? "lfg-xai-mcp" : auth.provider,
    access: data.access_token,
    refresh: data.refresh_token || auth.refresh,
    expires: Date.now() + Number(data.expires_in || 3600) * 1000,
    tokenEndpoint,
    tokenType: auth.tokenType || "Bearer",
  }
  writeDedicatedMcpAuth(refreshed)
  return refreshed
}

function readDedicatedMcpAuth(path) {
  if (!existsSync(path)) return undefined
  try {
    const data = JSON.parse(readFileSync(path, "utf8"))
    if (!isRecord(data)) return undefined
    if (typeof data.apiKey === "string" && data.apiKey.trim().length > 0) {
      const baseUrl = typeof data.baseUrl === "string" ? data.baseUrl.trim().replace(/\/$/, "") : undefined
      return {
        provider: "lfg-xai-mcp",
        access: data.apiKey.trim(),
        refresh: "",
        expires: Number.MAX_SAFE_INTEGER,
        tokenEndpoint: XAI_OAUTH_TOKEN_URL,
        tokenType: "Bearer",
        ...(baseUrl ? { baseUrl } : {}),
      }
    }
    if (data.access && data.refresh && data.expires) {
      const tokenEndpoint = safeXaiOAuthTokenEndpoint(data.tokenEndpoint)
      if (!tokenEndpoint) return undefined
      const baseUrl = typeof data.baseUrl === "string" ? data.baseUrl.trim().replace(/\/$/, "") : undefined
      return {
        provider: typeof data.provider === "string" ? data.provider : "xai-oauth",
        access: String(data.access),
        refresh: String(data.refresh),
        expires: Number(data.expires),
        tokenEndpoint,
        tokenType: typeof data.tokenType === "string" ? data.tokenType : "Bearer",
        ...(baseUrl ? { baseUrl } : {}),
      }
    }
    return undefined
  } catch {
    return undefined
  }
}

function readStoredAuth() {
  const dedicated = readDedicatedMcpAuth(dedicatedAuthPath())
  if (dedicated) return dedicated
  const legacy = readPackageStoredAuth(legacyAuthPath())
  if (legacy) return legacy
  return undefined
}

function readPackageStoredAuth(path) {
  if (!existsSync(path)) return undefined
  try {
    const data = JSON.parse(readFileSync(path, "utf8"))
    if (!isRecord(data) || !data.access || !data.refresh || !data.expires) return undefined
    const tokenEndpoint = safeXaiOAuthTokenEndpoint(data.tokenEndpoint)
    if (!tokenEndpoint) return undefined
    return {
      provider: "xai-oauth",
      access: String(data.access),
      refresh: String(data.refresh),
      expires: Number(data.expires),
      tokenEndpoint,
      tokenType: typeof data.tokenType === "string" ? data.tokenType : "Bearer",
    }
  } catch {
    return undefined
  }
}

function readGrokStoredAuth(path) {
  if (!existsSync(path)) return undefined
  try {
    const data = JSON.parse(readFileSync(path, "utf8"))
    if (!isRecord(data)) return undefined
    for (const value of Object.values(data)) {
      if (!isRecord(value)) continue
      // GrokBuild host OIDC may use client_id "grok-cli" or a host-assigned UUID.
      if (value.auth_mode !== "oidc" || value.oidc_issuer !== XAI_OAUTH_ISSUER) continue
      const clientId = typeof value.oidc_client_id === "string" ? value.oidc_client_id.trim() : ""
      if (!clientId) continue
      const access = typeof value.key === "string" ? value.key : ""
      const refresh = typeof value.refresh_token === "string" ? value.refresh_token : ""
      const expiresAt = typeof value.expires_at === "string" ? Date.parse(value.expires_at) : Number.NaN
      if (access && refresh && !Number.isNaN(expiresAt))
        return {
          provider: "grok-oauth",
          access,
          refresh,
          expires: expiresAt,
          tokenEndpoint: XAI_OAUTH_TOKEN_URL,
          tokenType: "Bearer",
        }
    }
    return undefined
  } catch {
    return undefined
  }
}

function writeDedicatedMcpAuth(auth) {
  const path = dedicatedAuthPath()
  const tokenEndpoint = parseXaiOAuthTokenEndpoint(auth.tokenEndpoint)
  const baseUrl = typeof auth.baseUrl === "string" && auth.baseUrl.trim() ? auth.baseUrl.trim().replace(/\/$/, "") : undefined
  const body =
    auth.refresh && auth.refresh.length > 0
      ? {
          provider: "lfg-xai-mcp",
          auth_mode: "oauth",
          access: auth.access,
          refresh: auth.refresh,
          expires: auth.expires,
          tokenEndpoint,
          tokenType: auth.tokenType || "Bearer",
          ...(baseUrl ? { baseUrl } : {}),
          updated_at: new Date().toISOString(),
        }
      : {
          provider: "lfg-xai-mcp",
          auth_mode: "api_key",
          apiKey: auth.access,
          ...(baseUrl ? { baseUrl } : {}),
          updated_at: new Date().toISOString(),
        }
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  rejectUnsafeExistingAuthPath(path)
  writeFileSync(path, JSON.stringify(body, null, 2), { mode: 0o600 })
  chmodSync(path, 0o600)
}

function parseXaiOAuthTokenEndpoint(value) {
  if (value === undefined || value === null || value === "") return XAI_OAUTH_TOKEN_URL
  if (value === XAI_OAUTH_TOKEN_URL) return XAI_OAUTH_TOKEN_URL
  throw new Error(`OAuth token endpoint must be ${XAI_OAUTH_TOKEN_URL}`)
}

function safeXaiOAuthTokenEndpoint(value) {
  if (value === undefined || value === null || value === "") return XAI_OAUTH_TOKEN_URL
  return value === XAI_OAUTH_TOKEN_URL ? XAI_OAUTH_TOKEN_URL : undefined
}

function rejectUnsafeExistingAuthPath(path) {
  try {
    if (lstatSync(path).isSymbolicLink()) throw new Error("Refusing to write xAI MCP auth through a symbolic link")
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") return
    throw error
  }
}

function extractResponseText(data) {
  if (typeof data.output_text === "string") return data.output_text
  if (!Array.isArray(data.output)) return ""
  const parts = []
  for (const item of data.output) {
    if (!Array.isArray(item?.content)) continue
    for (const content of item.content) {
      if (typeof content?.text === "string") parts.push(content.text)
      if (typeof content?.summary === "string") parts.push(content.summary)
    }
  }
  return parts.join("\n")
}

function extractCitations(data) {
  const citations = []
  const visit = (value) => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item)
      return
    }
    if (!isRecord(value)) return
    if (typeof value.url === "string" && (value.type === "url_citation" || typeof value.title === "string")) citations.push(compact({ url: value.url, title: typeof value.title === "string" ? value.title : undefined }))
    for (const nested of Object.values(value)) visit(nested)
  }
  visit(data)
  return Array.from(new Map(citations.map((item) => [item.url, item])).values())
}

function extractInlineCitations(data) {
  const citations = []
  const visit = (value) => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item)
      return
    }
    if (!isRecord(value)) return
    if (value.type === "citation" || value.type === "url_citation") citations.push(value)
    for (const nested of Object.values(value)) visit(nested)
  }
  visit(data)
  return citations
}

function promptOrQuery(args) {
  return optionalString(args.prompt) || optionalString(args.query) || requiredString(undefined, "prompt")
}

function requiredString(value, name) {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${name} must be a non-empty string`)
  return value
}

function optionalString(value) {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

function optionalNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function optionalBoolean(value) {
  return typeof value === "boolean" ? value : undefined
}

function optionalStringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.length > 0) : undefined
}

function oauthExpiryFromArgs(args) {
  const expiresAt = optionalString(args.expires_at)
  if (expiresAt) {
    const parsed = Date.parse(expiresAt)
    if (!Number.isNaN(parsed) && parsed > Date.now()) return parsed
    return undefined
  }
  const expiresIn = optionalNumber(args.expires_in)
  if (expiresIn !== undefined && expiresIn > 0) return Date.now() + expiresIn * 1000
  return undefined
}

function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined))
}

function textJson(value) {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] }
}

function writeResult(id, result) {
  stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n")
}

function writeError(id, code, message) {
  stdout.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message: redact(message) } }) + "\n")
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function safeJson(text, fallback) {
  try {
    return JSON.parse(text)
  } catch {
    return fallback
  }
}

function unlinkIfExists(path) {
  try {
    unlinkSync(path)
    return true
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") return false
    throw error
  }
}

function accessTokenIsExpiring(token) {
  const payload = token.split(".")[1]
  if (!payload) return false
  try {
    let padded = payload.replace(/-/g, "+").replace(/_/g, "/")
    while (padded.length % 4 !== 0) padded += "="
    const claims = JSON.parse(Buffer.from(padded, "base64").toString("utf8"))
    return typeof claims.exp === "number" && claims.exp * 1000 <= Date.now() + REFRESH_SKEW_MS
  } catch {
    return false
  }
}

function redact(value) {
  return String(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+/g, "Bearer [REDACTED]")
    .replace(/(access_token|refresh_token|api[_-]?key|key)"?\s*[:=]\s*"?[^"\s,}]+/gi, "$1:[REDACTED]")
}
