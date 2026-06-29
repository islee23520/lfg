import { createInterface } from "node:readline"
import { stdin as input, stdout as output } from "node:process"
import type { JsonObject } from "../../shared/json"
import {
  clearXaiMcpAuth,
  getXaiMcpAuthStatus,
  resolveXaiMcpAuthPath,
  writeXaiMcpApiKey,
  writeXaiMcpOAuth,
  XAI_OAUTH_TOKEN_URL,
} from "../../grok/mcp/xai-mcp-auth"
import { resolveGrokSetupHome } from "../../grok/install/grok-home"

type XaiAuthCommandOptions = {
  readonly json: boolean
  readonly apiKeyFlag: string | null
  readonly oauthAccessToken?: string | null
  readonly oauthRefreshToken?: string | null
  readonly oauthExpiresAt?: string | null
  readonly oauthExpiresIn?: string | null
  readonly oauthTokenEndpoint?: string | null
  readonly oauthTokenType?: string | null
}

export async function dispatchXaiAuthCommand(
  subcommand: string | undefined,
  options: XaiAuthCommandOptions,
): Promise<JsonObject | string> {
  const action = subcommand ?? "status"
  if (action === "status" || action === "check") {
    const status = await getXaiMcpAuthStatus(process.env)
    const payload: JsonObject = {
      ok: status.ok,
      status: "xai_auth_status",
      mode: status.mode,
      authFile: status.authFile,
      expiresAt: status.expiresAt,
      provider: status.provider,
      message: status.message,
      grokHostAuthUntouched: true,
    }
    if (options.json) {
      return payload
    }
    return [
      "xai_grok MCP authentication (lfg)",
      `  dedicated file: ${status.authFile}`,
      `  mode: ${status.mode}`,
      `  ok: ${status.ok}`,
      status.expiresAt === null ? "" : `  expires: ${status.expiresAt}`,
      `  ${status.message}`,
      "",
      "Grok host ~/.grok/auth.json is never modified by xai_grok MCP.",
      "Configure: lfg xai auth set-api-key | set-oauth   Clear: lfg xai auth logout",
    ]
      .filter((line) => line.length > 0)
      .join("\n")
  }
  if (action === "set-api-key") {
    const key = options.apiKeyFlag ?? (await promptHiddenApiKey())
    if (key === null || key.trim().length === 0) {
      return options.json
        ? { ok: false, status: "xai_auth_cancelled", error: "No API key provided" }
        : "Cancelled: no API key provided."
    }
    const path = resolveXaiMcpAuthPath(process.env, resolveGrokSetupHome(process.env))
    await writeXaiMcpApiKey(path, key)
    const status = await getXaiMcpAuthStatus(process.env)
    const payload: JsonObject = {
      ok: true,
      status: "xai_auth_saved",
      mode: status.mode,
      authFile: path,
      message: "Saved API key to dedicated xai_grok MCP auth file (Grok host auth.json unchanged).",
    }
    if (options.json) {
      return payload
    }
    return `Saved xAI API key to ${path}\nReload MCP in Grok (/mcps → r) or start a new session.`
  }
  if (action === "set-oauth" || action === "set-oauth-token" || action === "login") {
    const access = options.oauthAccessToken?.trim() ?? ""
    const refresh = options.oauthRefreshToken?.trim() ?? ""
    const expires = parseOAuthExpiry(options)
    if (access.length === 0 || refresh.length === 0 || expires === null) {
      const error = "OAuth setup requires --access-token, --refresh-token, and --expires-at or --expires-in."
      return options.json ? { ok: false, status: "xai_oauth_missing_fields", error } : error
    }
    const path = resolveXaiMcpAuthPath(process.env, resolveGrokSetupHome(process.env))
    await writeXaiMcpOAuth(path, {
      provider: "xai-oauth",
      access,
      refresh,
      expires,
      tokenEndpoint: options.oauthTokenEndpoint?.trim() || XAI_OAUTH_TOKEN_URL,
      tokenType: options.oauthTokenType?.trim() || "Bearer",
    })
    const status = await getXaiMcpAuthStatus(process.env)
    const payload: JsonObject = {
      ok: status.ok,
      status: "xai_oauth_saved",
      mode: status.mode,
      authFile: path,
      expiresAt: status.expiresAt,
      message: "Saved OAuth tokens to dedicated xai_grok MCP auth file (Grok host auth.json unchanged).",
    }
    if (options.json) {
      return payload
    }
    return `Saved xAI OAuth tokens to ${path}\nReload MCP in Grok (/mcps → r) or start a new session.`
  }
  if (action === "logout" || action === "clear") {
    const path = resolveXaiMcpAuthPath(process.env, resolveGrokSetupHome(process.env))
    const removed = await clearXaiMcpAuth(path)
    const payload: JsonObject = {
      ok: true,
      status: "xai_auth_cleared",
      authFile: path,
      removed,
      message: removed
        ? "Removed dedicated xai_grok MCP credentials. Grok host auth.json was not modified."
        : "No dedicated auth file to remove. Grok host auth.json was not modified.",
    }
    if (options.json) {
      return payload
    }
    return payload.message as string
  }
  return {
    ok: false,
    status: "invalid_xai_auth_subcommand",
    error: `Unknown xai auth action: ${action}`,
    supported: ["status", "set-api-key", "set-oauth", "logout"],
  }
}

function parseOAuthExpiry(options: XaiAuthCommandOptions): number | null {
  const expiresAt = options.oauthExpiresAt?.trim()
  if (expiresAt !== undefined && expiresAt.length > 0) {
    const parsed = Date.parse(expiresAt)
    return Number.isNaN(parsed) ? null : parsed
  }
  const expiresIn = options.oauthExpiresIn?.trim()
  if (expiresIn !== undefined && expiresIn.length > 0) {
    const seconds = Number(expiresIn)
    return Number.isFinite(seconds) && seconds > 0 ? Date.now() + seconds * 1000 : null
  }
  return null
}

async function promptHiddenApiKey(): Promise<string | null> {
  if (!input.isTTY) {
    return null
  }
  const rl = createInterface({ input, output })
  const key = await new Promise<string>((resolve) => {
    rl.question("xAI API key (paste and press Enter): ", (answer) => {
      rl.close()
      resolve(answer)
    })
  })
  return key
}
