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
import {
  detectLocalCliProxyCredentials,
  type LocalCliProxyDetectionReport,
} from "../../grok/mcp/xai-cli-proxy-credentials"
import { resolveGrokSetupHome } from "../../grok/install/grok-home"

type XaiAuthCommandOptions = {
  readonly json: boolean
  readonly apiKeyFlag: string | null
  readonly baseUrlFlag?: string | null
  readonly oauthAccessToken?: string | null
  readonly oauthRefreshToken?: string | null
  readonly oauthExpiresAt?: string | null
  readonly oauthExpiresIn?: string | null
  readonly oauthTokenEndpoint?: string | null
  readonly oauthTokenType?: string | null
  /** When true, skip live /models probe during auto-detect. */
  readonly noProbe?: boolean
}

export async function dispatchXaiAuthCommand(
  subcommand: string | undefined,
  options: XaiAuthCommandOptions,
): Promise<JsonObject | string> {
  const action = subcommand ?? "status"
  if (action === "detect" || action === "discover") {
    return formatDetectionReport(
      await detectLocalCliProxyCredentials(process.env, {
        home: resolveGrokSetupHome(process.env),
        preferredBaseUrl: options.baseUrlFlag,
        probe: options.noProbe !== true,
      }),
      options.json,
    )
  }
  if (action === "status" || action === "check") {
    const status = await getXaiMcpAuthStatus(process.env)
    const payload: JsonObject = {
      ok: status.ok,
      status: "xai_auth_status",
      mode: status.mode,
      authFile: status.authFile,
      expiresAt: status.expiresAt,
      provider: status.provider,
      baseUrl: status.baseUrl,
      source: status.source,
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
      status.baseUrl === null ? "" : `  baseUrl: ${status.baseUrl}`,
      status.source === null ? "" : `  source: ${status.source}`,
      `  ${status.message}`,
      "",
      "Grok host ~/.grok/auth.json is never modified by xai_grok MCP.",
      "Configure:",
      "  lfg xai auth detect                         # run collect→normalize→score→probe→select",
      "  lfg xai auth set-api-key [--api-key KEY] [--base-url URL]",
      "    (omit --api-key to auto-select via detection algorithm)",
      "  lfg xai auth logout",
    ]
      .filter((line) => line.length > 0)
      .join("\n")
  }
  if (action === "set-api-key") {
    return setApiKeyFromOptions(options)
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
    supported: ["status", "detect", "set-api-key", "set-oauth", "logout"],
  }
}

async function setApiKeyFromOptions(options: XaiAuthCommandOptions): Promise<JsonObject | string> {
  const home = resolveGrokSetupHome(process.env)
  const preferredBaseUrl = options.baseUrlFlag?.trim() || null
  const explicitKey = options.apiKeyFlag?.trim() ?? ""

  let apiKey = explicitKey
  let baseUrl: string | null = preferredBaseUrl
  let source: string | null = explicitKey.length > 0 ? "cli:--api-key" : null
  let detection: LocalCliProxyDetectionReport | null = null

  if (apiKey.length === 0) {
    detection = await detectLocalCliProxyCredentials(process.env, {
      home,
      preferredBaseUrl,
      probe: options.noProbe !== true,
    })
    if (detection.selected !== null) {
      apiKey = detection.selected.apiKey
      baseUrl = preferredBaseUrl ?? detection.selected.baseUrl
      source = detection.selected.source
    } else {
      const prompted = await promptHiddenApiKey()
      if (prompted === null || prompted.trim().length === 0) {
        const error =
          "No API key provided and auto-detection found no local CLI proxy credentials (algorithm: collect→normalize→score→probe→select)."
        return options.json
          ? {
              ok: false,
              status: "xai_auth_cancelled",
              error,
              detection: detectionPublicJson(detection),
            }
          : `Cancelled: ${error}\nRun: lfg xai auth detect\nOr pass --api-key KEY.`
      }
      apiKey = prompted.trim()
      source = "cli:prompt"
    }
  } else if (baseUrl === null) {
    // Explicit key without base-url: still attach best local proxy base via the same algorithm.
    detection = await detectLocalCliProxyCredentials(process.env, {
      home,
      probe: options.noProbe !== true,
    })
    if (detection.selected !== null) {
      baseUrl = detection.selected.baseUrl
      source = `cli:--api-key+${detection.selected.source}`
    }
  }

  const path = resolveXaiMcpAuthPath(process.env, home)
  await writeXaiMcpApiKey(path, apiKey, { baseUrl, source })
  const status = await getXaiMcpAuthStatus(process.env)
  const payload: JsonObject = {
    ok: true,
    status: "xai_auth_saved",
    mode: status.mode,
    authFile: path,
    baseUrl: status.baseUrl,
    source: status.source,
    message: baseUrl
      ? `Saved API key for local CLI proxy at ${baseUrl} (source=${source ?? "unknown"}; Grok host auth.json unchanged).`
      : "Saved API key to dedicated xai_grok MCP auth file (Grok host auth.json unchanged).",
    ...(detection === null ? {} : { detection: detectionPublicJson(detection) }),
  }
  if (options.json) {
    return payload
  }
  return [
    `Saved xAI API key to ${path}`,
    baseUrl ? `  baseUrl: ${baseUrl}` : null,
    source ? `  source: ${source}` : null,
    detection?.selected
      ? `  detect: score=${detection.selected.score} class=${detection.selected.sourceClass}${detection.selected.probe?.live ? " live" : ""}`
      : null,
    "Reload MCP in Grok (/mcps → r) or start a new session.",
  ]
    .filter((line): line is string => line !== null)
    .join("\n")
}

function formatDetectionReport(report: LocalCliProxyDetectionReport, json: boolean): JsonObject | string {
  const payload = {
    ok: report.ok,
    status: "xai_auth_detect",
    ...detectionPublicJson(report),
    message: report.message,
  }
  if (json) return payload
  const lines = [
    "xai_grok local CLI proxy auto-detection",
    `  algorithm: ${report.algorithm}`,
    `  phases: ${report.phases.join(" → ")}`,
    `  probe: ${report.probeEnabled ? "on" : "off"}`,
    report.preferredBaseUrl ? `  preferredBaseUrl: ${report.preferredBaseUrl}` : null,
    `  candidates: ${report.candidates.length}`,
    ...report.candidates.map(
      (c, i) =>
        `    [${i}] score=${c.score} class=${c.sourceClass} ${c.source} → ${c.baseUrl}` +
        (c.probe?.attempted ? (c.probe.live ? ` live(http=${c.probe.httpStatus})` : " dead") : ""),
    ),
    report.selected
      ? `  SELECTED: ${report.selected.source} → ${report.selected.baseUrl} (score=${report.selected.score})`
      : "  SELECTED: (none)",
    "",
    "Apply with: lfg xai auth set-api-key",
  ]
  return lines.filter((line): line is string => line !== null).join("\n")
}

/** Public JSON never includes raw API keys — only fingerprints. */
function detectionPublicJson(report: LocalCliProxyDetectionReport): JsonObject {
  return {
    algorithm: report.algorithm,
    phases: [...report.phases],
    preferredBaseUrl: report.preferredBaseUrl,
    probeEnabled: report.probeEnabled,
    candidates: report.candidates.map((c) => ({
      source: c.source,
      sourceClass: c.sourceClass,
      baseUrl: c.baseUrl,
      score: c.score,
      keyFingerprint: c.keyFingerprint,
      probe: c.probe ?? null,
    })),
    selected:
      report.selected === null
        ? null
        : {
            source: report.selected.source,
            sourceClass: report.selected.sourceClass,
            baseUrl: report.selected.baseUrl,
            score: report.selected.score,
            keyFingerprint: report.selected.keyFingerprint,
            probe: report.selected.probe ?? null,
          },
    traces: report.traces.map((t) => ({ ...t })),
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
    rl.question("xAI API key (paste and press Enter; leave empty to cancel): ", (answer) => {
      rl.close()
      resolve(answer)
    })
  })
  return key
}
