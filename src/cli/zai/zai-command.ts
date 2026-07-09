import { createInterface } from "node:readline"
import { stdin as input, stdout as output } from "node:process"
import type { JsonObject } from "../../shared/json"
import {
  clearZaiMcpAuth,
  getZaiMcpAuthStatus,
  parseZaiMode,
  resolveZaiMcpAuthPath,
  writeZaiMcpApiKey,
  type ZaiMode,
} from "../../grok/mcp/zai-mcp-auth"
import {
  getZaiMcpPackageStatus,
  installZaiMcpPackages,
  uninstallZaiMcpPackages,
  ZAI_MCP_PACKAGE_IDS,
} from "../../grok/mcp/zai-mcp-packages"
import { resolveGrokSetupHome } from "../../grok/install/grok-home"

export type ZaiCommandOptions = {
  readonly json: boolean
  readonly apiKeyFlag: string | null
  readonly modeFlag: string | null
  readonly rest: readonly string[]
}

export async function dispatchZaiCommand(
  subcommand: string | undefined,
  third: string | undefined,
  options: ZaiCommandOptions,
): Promise<JsonObject | string> {
  const action = subcommand ?? "help"
  if (action === "help" || action === "--help" || action === "-h") {
    return zaiHelp()
  }
  if (action === "auth") {
    return dispatchZaiAuth(third, options)
  }
  if (action === "mcp") {
    return dispatchZaiMcp(third, options)
  }
  return options.json
    ? {
        ok: false,
        status: "zai_unknown_command",
        error: `Unknown zai subcommand "${action}"`,
        supported: ["auth", "mcp"],
      }
    : `Unknown zai subcommand "${action}".\n${zaiHelp()}`
}

async function dispatchZaiAuth(action: string | undefined, options: ZaiCommandOptions): Promise<JsonObject | string> {
  const cmd = action ?? "status"
  if (cmd === "status" || cmd === "check") {
    const status = await getZaiMcpAuthStatus(process.env)
    const payload: JsonObject = {
      ok: status.ok,
      status: "zai_auth_status",
      authFile: status.authFile,
      mode: status.mode,
      source: status.source,
      message: status.message,
    }
    if (options.json) return payload
    return [
      "Z.AI MCP authentication (lfg)",
      `  dedicated file: ${status.authFile}`,
      `  source: ${status.source}`,
      `  mode: ${status.mode ?? "(none)"}`,
      `  ok: ${status.ok}`,
      `  ${status.message}`,
      "",
      "Configure: lfg zai auth set-api-key [--api-key KEY] [--mode ZAI|ZHIPU]",
      "Clear:     lfg zai auth logout",
    ].join("\n")
  }
  if (cmd === "set-api-key") {
    const key = options.apiKeyFlag ?? (await promptHiddenApiKey())
    if (key === null || key.trim().length === 0) {
      return options.json
        ? { ok: false, status: "zai_auth_cancelled", error: "No API key provided" }
        : "Cancelled: no API key provided."
    }
    const mode = parseZaiMode(options.modeFlag) ?? "ZAI"
    if (options.modeFlag !== null && parseZaiMode(options.modeFlag) === null) {
      return options.json
        ? { ok: false, status: "zai_auth_invalid_mode", error: "mode must be ZAI or ZHIPU" }
        : "Invalid --mode. Use ZAI or ZHIPU."
    }
    const path = resolveZaiMcpAuthPath(process.env, resolveGrokSetupHome(process.env))
    await writeZaiMcpApiKey(path, key, mode as ZaiMode)
    const payload: JsonObject = {
      ok: true,
      status: "zai_auth_saved",
      authFile: path,
      mode,
      message: "Saved Z.AI API key to dedicated auth file.",
    }
    if (options.json) return payload
    return `Saved Z.AI API key to ${path} (mode=${mode})\nNext: lfg zai mcp install all`
  }
  if (cmd === "logout" || cmd === "clear") {
    const path = resolveZaiMcpAuthPath(process.env, resolveGrokSetupHome(process.env))
    await clearZaiMcpAuth(path)
    const payload: JsonObject = { ok: true, status: "zai_auth_cleared", authFile: path }
    if (options.json) return payload
    return `Cleared Z.AI MCP credentials at ${path}`
  }
  return options.json
    ? { ok: false, status: "zai_auth_unknown", error: `Unknown auth action "${cmd}"` }
    : `Unknown auth action "${cmd}". Use status | set-api-key | logout.`
}

async function dispatchZaiMcp(action: string | undefined, options: ZaiCommandOptions): Promise<JsonObject | string> {
  const cmd = action ?? "status"
  if (cmd === "status" || cmd === "list") {
    const status = await getZaiMcpPackageStatus()
    if (options.json) return { ...status }
    const lines = [
      "Z.AI MCP packages for GrokBuild",
      `  config: ${status.configPath}`,
      `  configured: ${status.configured.length === 0 ? "(none)" : status.configured.join(", ")}`,
      "",
      "Catalog:",
      ...status.catalog.map((item) => `  - ${item.id} (${item.kind}): ${item.description}`),
      "",
      "Install:   lfg zai mcp install all|vision|web-search|web-reader|zread",
      "Uninstall: lfg zai mcp uninstall all|vision|web-search|web-reader|zread",
    ]
    return lines.join("\n")
  }
  if (cmd === "install") {
    const targets = options.rest.length > 0 ? options.rest : ["all"]
    const mode = parseZaiMode(options.modeFlag) ?? undefined
    if (options.modeFlag !== null && mode === undefined) {
      return options.json
        ? { ok: false, status: "zai_mcp_invalid_mode", error: "mode must be ZAI or ZHIPU" }
        : "Invalid --mode. Use ZAI or ZHIPU."
    }
    const result = await installZaiMcpPackages({ targets, ...(mode === undefined ? {} : { mode }) })
    if (options.json) {
      return {
        ok: result.ok,
        status: result.status,
        configPath: result.configPath,
        installed: result.installed,
        packages: result.packages,
        ...(result.error === undefined ? {} : { error: result.error }),
        message: result.message,
      }
    }
    return result.message
  }
  if (cmd === "uninstall" || cmd === "remove") {
    const targets = options.rest.length > 0 ? options.rest : ["all"]
    const result = await uninstallZaiMcpPackages({ targets })
    if (options.json) {
      return {
        ok: result.ok,
        status: result.status,
        configPath: result.configPath,
        removed: result.removed,
        ...(result.error === undefined ? {} : { error: result.error }),
        message: result.message,
      }
    }
    return result.message
  }
  return options.json
    ? {
        ok: false,
        status: "zai_mcp_unknown",
        error: `Unknown mcp action "${cmd}"`,
        supported: ["status", "install", "uninstall"],
        packages: [...ZAI_MCP_PACKAGE_IDS, "all"],
      }
    : `Unknown mcp action "${cmd}". Use status | install | uninstall.`
}

function zaiHelp(): string {
  return [
    "lfg zai - optional Z.AI MCP packages for GrokBuild",
    "",
    "Auth:",
    "  lfg zai auth status",
    "  lfg zai auth set-api-key [--api-key KEY] [--mode ZAI|ZHIPU]",
    "  lfg zai auth logout",
    "",
    "MCP packages (register into ~/.grok/config.toml [mcp_servers.*]):",
    "  lfg zai mcp status",
    "  lfg zai mcp install all",
    "  lfg zai mcp install vision web-search web-reader zread",
    "  lfg zai mcp uninstall vision",
    "",
    "Packages:",
    "  vision      local  @z_ai/mcp-server (npx) — image/video analysis",
    "  web-search  remote https://api.z.ai/api/mcp/web_search_prime/mcp",
    "  web-reader  remote https://api.z.ai/api/mcp/web_reader/mcp",
    "  zread       remote https://api.z.ai/api/mcp/zread/mcp",
    "",
    "Docs: https://docs.z.ai/devpack/mcp/vision-mcp-server",
  ].join("\n")
}

async function promptHiddenApiKey(): Promise<string | null> {
  if (!input.isTTY || !output.isTTY) return null
  const rl = createInterface({ input, output, terminal: true })
  try {
    const answer = await new Promise<string>((resolve) => {
      rl.question("Z.AI API key (input hidden not supported in all terminals): ", resolve)
    })
    return answer
  } finally {
    rl.close()
  }
}
