import { access, readFile } from "node:fs/promises"
import { isAbsolute, join, resolve } from "node:path"

export const EXPECTED_MCP_SERVERS = ["ast_grep", "grep_app", "context7", "git_bash", "lsp", "xai_grok"] as const
export const REMOTE_MCP_SERVERS = {
  grep_app: "https://mcp.grep.app",
  context7: "https://mcp.context7.com/mcp",
} as const
export const LOCAL_MCP_SERVERS = [
  { name: "ast_grep", runtimeDir: "ast-grep-mcp", componentDir: "ast-grep" },
  { name: "git_bash", runtimeDir: "git-bash-mcp", componentDir: "git-bash" },
  { name: "lsp", runtimeDir: "lsp-daemon", componentDir: "lsp" },
  { name: "xai_grok", runtimeDir: "xai-grok-mcp", componentDir: "xai-grok" },
] as const

export type LocalMcpServer = (typeof LOCAL_MCP_SERVERS)[number]

export type McpVerificationResult = {
  readonly ok: boolean
  readonly manifestPath: string
  readonly expectedServers: readonly string[]
  readonly localServers: readonly string[]
  readonly remoteServers: readonly string[]
  readonly disabledServers: readonly string[]
  readonly remoteLiveCalls: false
  readonly gitBash: "manifest_only_windows_unverified" | "manifest_only_disabled_non_windows" | "misconfigured"
  readonly windowsExecution: "unverified_no_windows_runner"
  readonly errors: readonly string[]
}

export async function verifyPluginMcpManifest(
  pluginRoot: string,
  platform: NodeJS.Platform = process.platform,
): Promise<McpVerificationResult> {
  const manifestPath = join(pluginRoot, ".mcp.json")
  const errors: string[] = []
  const parsed = await readMcpManifestSafe(manifestPath, errors)
  const mcpServers = objectField(parsed, "mcpServers")
  const disabledServers = stringArrayField(parsed, "disabled_mcp_servers")

  if (mcpServers === null) {
    errors.push("mcpServers missing")
  } else {
    for (const name of EXPECTED_MCP_SERVERS) {
      if (objectField(mcpServers, name) === null) errors.push(`mcpServers.${name} missing`)
    }
    for (const server of LOCAL_MCP_SERVERS) {
      await validateLocalServer({ pluginRoot, mcpServers, server, errors })
    }
    validateRemoteServer(mcpServers, "grep_app", REMOTE_MCP_SERVERS.grep_app, errors)
    validateRemoteServer(mcpServers, "context7", REMOTE_MCP_SERVERS.context7, errors)
  }

  const gitBash = gitBashStatus(platform, disabledServers, errors)
  return {
    ok: errors.length === 0,
    manifestPath,
    expectedServers: EXPECTED_MCP_SERVERS,
    localServers: LOCAL_MCP_SERVERS.map((server) => server.name),
    remoteServers: Object.keys(REMOTE_MCP_SERVERS),
    disabledServers,
    remoteLiveCalls: false,
    gitBash,
    windowsExecution: "unverified_no_windows_runner",
    errors,
  }
}

export async function localRuntimeBinariesExist(root: string): Promise<boolean> {
  for (const server of LOCAL_MCP_SERVERS) {
    if (!(await pathExists(join(root, server.runtimeDir, "dist", "cli.js")))) return false
  }
  return true
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function readMcpManifestSafe(path: string, errors: string[]): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown
  } catch (error) {
    errors.push(error instanceof SyntaxError ? "mcp manifest malformed JSON" : "mcp manifest missing")
    return null
  }
}

type LocalServerValidation = {
  readonly pluginRoot: string
  readonly mcpServers: Record<string, unknown>
  readonly server: LocalMcpServer
  readonly errors: string[]
}

async function validateLocalServer(options: LocalServerValidation): Promise<void> {
  const { server: expected } = options
  const server = objectField(options.mcpServers, expected.name)
  if (server === null) return
  if (server.command !== "node") options.errors.push(`mcpServers.${expected.name}.command must be node`)
  const args = stringArrayField(server, "args")
  if (args.length < 2) {
    options.errors.push(`mcpServers.${expected.name}.args missing`)
    return
  }
  if (args[1] !== "mcp") options.errors.push(`mcpServers.${expected.name}.args[1] must be mcp`)
  const cwd = typeof server.cwd === "string" ? server.cwd : options.pluginRoot
  const base = cwd === "." ? options.pluginRoot : cwd
  const cliPath = isAbsolute(args[0] ?? "") ? (args[0] ?? "") : resolve(base, args[0] ?? "")
  if (!cliPath.startsWith(options.pluginRoot)) {
    options.errors.push(`mcpServers.${expected.name}.args[0] must stay inside plugin root`)
  }
  if (!cliPath.includes(join(expected.runtimeDir, "dist", "cli.js")) && !cliPath.includes(join("components", expected.componentDir, "dist", "cli.js"))) {
    options.errors.push(`mcpServers.${expected.name}.args[0] has unexpected runtime path`)
  }
  if (!(await pathExists(cliPath))) options.errors.push(`mcpServers.${expected.name}.args[0] binary missing`)
  if (cliPath.includes(join("components", expected.componentDir, "dist", "cli.js"))) {
    const runtimePath = join(options.pluginRoot, "mcp-runtimes", expected.runtimeDir, "dist", "cli.js")
    if (!(await pathExists(runtimePath))) options.errors.push(`mcpServers.${expected.name}.runtime target missing`)
  }
}

function validateRemoteServer(
  mcpServers: Record<string, unknown>,
  name: keyof typeof REMOTE_MCP_SERVERS,
  expectedUrl: string,
  errors: string[],
): void {
  const server = objectField(mcpServers, name)
  if (server === null) return
  if (typeof server.url !== "string") {
    errors.push(`mcpServers.${name}.url must be https URL`)
    return
  }
  try {
    const url = new URL(server.url)
    if (url.protocol !== "https:") errors.push(`mcpServers.${name}.url must be https URL`)
  } catch {
    errors.push(`mcpServers.${name}.url must be https URL`)
    return
  }
  if (server.url !== expectedUrl) errors.push(`mcpServers.${name}.url must be ${expectedUrl}`)
}

function gitBashStatus(
  platform: NodeJS.Platform,
  disabledServers: readonly string[],
  errors: string[],
): McpVerificationResult["gitBash"] {
  const disabled = disabledServers.includes("git_bash")
  if (platform === "win32") {
    return "manifest_only_windows_unverified"
  }
  if (!disabled) errors.push("git_bash must be disabled on non-Windows")
  return disabled ? "manifest_only_disabled_non_windows" : "misconfigured"
}

function objectField(value: unknown, key: string): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null
  const record = value as { readonly [field: string]: unknown }
  const field = record[key]
  if (typeof field !== "object" || field === null || Array.isArray(field)) return null
  return field as Record<string, unknown>
}

function stringArrayField(value: unknown, key: string): readonly string[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return []
  const record = value as { readonly [field: string]: unknown }
  const field = record[key]
  if (!Array.isArray(field)) return []
  return field.filter((item): item is string => typeof item === "string")
}
