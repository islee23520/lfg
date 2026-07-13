import { access, mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { removeTomlSectionsByPrefix, tomlString, upsertSection } from "../../cli/config/lfg-grok-config-toml"
import { resolveGrokAdapterPluginRoot } from "../payload/grok-adapter-paths"
import { nativeGrokPluginRoot } from "../payload/install"

/** Config.toml server id used by Grok /mcps UI (matches plugin .mcp.json + codex-xai-oauth surface). */
export const XAI_GROK_MCP_CONFIG_NAME = "xai_grok" as const

export type EnsureXaiGrokMcpConfigResult = {
  readonly ok: boolean
  readonly status: string
  readonly configPath: string
  readonly pluginRoot: string | null
  readonly runtimeCli: string | null
  readonly changed: boolean
  readonly message: string
}

/**
 * Built-in Grok enhanced-search MCP registration (core lfg, not the optional lfg-mcp companion).
 *
 * Writes `[mcp_servers.xai_grok]` into `~/.grok/config.toml` pointing at the
 * plugin-local stdio runtime under `~/.grok/plugins/lfg/mcp-runtimes/xai-grok-mcp`.
 * Runtime ships tools: xai_web_search, xai_x_search, xai_generate_text, media, auth helpers.
 *
 * Auth is separate (`lfg xai auth`); missing credentials do not block registration.
 */
export async function ensureXaiGrokMcpConfig(home: string): Promise<EnsureXaiGrokMcpConfigResult> {
  const configPath = join(home, ".grok", "config.toml")
  const resolved = await resolveGrokAdapterPluginRoot(home)
  const pluginRoot = resolved?.pluginRoot ?? nativeGrokPluginRoot(home, "lfg")
  const runtimeCli = join(pluginRoot, "mcp-runtimes", "xai-grok-mcp", "dist", "cli.js")

  if (!(await pathExists(runtimeCli))) {
    return {
      ok: false,
      status: "xai_mcp_runtime_missing",
      configPath,
      pluginRoot,
      runtimeCli,
      changed: false,
      message:
        "xai_grok MCP runtime missing under the lfg plugin tree. Re-run `lfg setup --run` (or --force) so mcp-runtimes/xai-grok-mcp is materialized.",
    }
  }

  const current = await readTextIfExists(configPath)
  const next = upsertXaiGrokMcpSection(current, runtimeCli)
  const changed = next !== current
  if (changed) {
    await mkdir(dirname(configPath), { recursive: true })
    await writeFile(configPath, ensureTrailingNewline(next), "utf8")
  }

  return {
    ok: true,
    status: changed ? "xai_mcp_registered" : "xai_mcp_already_registered",
    configPath,
    pluginRoot,
    runtimeCli,
    changed,
    message: changed
      ? `Registered built-in [mcp_servers.${XAI_GROK_MCP_CONFIG_NAME}] for Grok enhanced search (web + X). Reload /mcps (r) or start a new session.`
      : `Built-in [mcp_servers.${XAI_GROK_MCP_CONFIG_NAME}] already present.`,
  }
}

/** Pure TOML upsert used by ensure + tests. */
export function upsertXaiGrokMcpSection(source: string, runtimeCli: string): string {
  let next = removeTomlSectionsByPrefix(source, `mcp_servers.${XAI_GROK_MCP_CONFIG_NAME}`)
  next = upsertSection(next, `mcp_servers.${XAI_GROK_MCP_CONFIG_NAME}`, [
    `command = ${tomlString("node")}`,
    "args = [",
    `    ${tomlString(runtimeCli)},`,
    `    ${tomlString("mcp")},`,
    "]",
    "enabled = true",
  ])
  return next
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function readTextIfExists(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8")
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return ""
    throw error
  }
}

function ensureTrailingNewline(value: string): string {
  if (value.length === 0) return ""
  return value.endsWith("\n") ? value : `${value}\n`
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error
}
