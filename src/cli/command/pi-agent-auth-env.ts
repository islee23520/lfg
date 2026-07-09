import { grokHostAuthPath } from "../../grok/mcp/xai-mcp-auth"
import {
  readGrokHostOidcForXai,
  readXaiMcpPackageAuth,
  resolveXaiMcpAuthPath,
  XAI_MCP_AUTH_FILE_ENV,
} from "../../grok/mcp/xai-mcp-auth"

const XAI_BASE_URL = "https://api.x.ai/v1" as const
const REFRESH_SKEW_MS = 2 * 60 * 1000

export type PiAgentAuthEnvResult =
  | { readonly ok: true; readonly env: NodeJS.ProcessEnv }
  | { readonly ok: false; readonly error: string }

export async function buildPiAgentLfgAuthEnv(baseEnv: NodeJS.ProcessEnv, home: string): Promise<PiAgentAuthEnvResult> {
  const authFile = resolveXaiMcpAuthPath(baseEnv, home)
  const dedicated = await readXaiMcpPackageAuth(authFile)
  if (dedicated !== null) {
    if (dedicated.apiKey !== undefined) {
      return { ok: true, env: withXaiEnv(baseEnv, dedicated.apiKey, authFile, "lfg-xai-api-key") }
    }
    if (dedicated.expires <= Date.now() + REFRESH_SKEW_MS) {
      return { ok: false, error: "Cannot launch pi-agent with expired dedicated lfg xAI OAuth credentials. Run `lfg xai auth set-oauth` or `lfg xai auth set-api-key`." }
    }
    return { ok: true, env: withXaiEnv(baseEnv, dedicated.access, authFile, "lfg-xai-oauth") }
  }

  const envXaiApiKey = parseOptionalEnvValue(baseEnv.XAI_API_KEY)
  if (envXaiApiKey !== undefined) {
    return { ok: true, env: withXaiEnv(baseEnv, envXaiApiKey, authFile, "xai-api-key-env") }
  }

  const hostOidc = await readGrokHostOidcForXai(grokHostAuthPath(home))
  if (hostOidc !== null && hostOidc.expires > Date.now() + REFRESH_SKEW_MS) {
    return { ok: true, env: withXaiEnv(baseEnv, hostOidc.access, authFile, "grok-host-oidc-readonly") }
  }
  return { ok: true, env: withoutMissingXaiCredentialOpenAiKey(baseEnv, authFile) }
}

function withXaiEnv(baseEnv: NodeJS.ProcessEnv, token: string, authFile: string, source: string): NodeJS.ProcessEnv {
  const openAiBaseUrl = parseOptionalEnvValue(baseEnv.OPENAI_BASE_URL) ?? XAI_BASE_URL
  const openAiApiKey = isXaiBaseUrl(openAiBaseUrl) ? token : parseOptionalEnvValue(baseEnv.OPENAI_API_KEY)
  const env: NodeJS.ProcessEnv = {
    ...baseEnv,
    [XAI_MCP_AUTH_FILE_ENV]: authFile,
    LFG_PI_AGENT_AUTH_SOURCE: source,
    XAI_API_KEY: token,
    XAI_BASE_URL: parseOptionalEnvValue(baseEnv.XAI_BASE_URL) ?? XAI_BASE_URL,
    OPENAI_BASE_URL: openAiBaseUrl,
  }
  if (openAiApiKey === undefined) {
    delete env.OPENAI_API_KEY
  } else {
    env.OPENAI_API_KEY = openAiApiKey
  }
  return env
}

function withoutMissingXaiCredentialOpenAiKey(baseEnv: NodeJS.ProcessEnv, authFile: string): NodeJS.ProcessEnv {
  const openAiBaseUrl = parseOptionalEnvValue(baseEnv.OPENAI_BASE_URL) ?? XAI_BASE_URL
  const env: NodeJS.ProcessEnv = { ...baseEnv, [XAI_MCP_AUTH_FILE_ENV]: authFile }
  if (isXaiBaseUrl(openAiBaseUrl)) {
    delete env.OPENAI_API_KEY
  }
  return env
}

function parseOptionalEnvValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed
}

function isXaiBaseUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.hostname === "api.x.ai"
  } catch (error) {
    if (error instanceof TypeError) {
      return false
    }
    throw error
  }
}
