import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { removeTomlSectionsByPrefix, tomlString, upsertSection } from "../../cli/config/lfg-grok-config-toml"
import { resolveGrokSetupHome } from "../install/grok-home"
import { resolveZaiApiKey, type ZaiMode } from "./zai-mcp-auth"

/** Official Z.AI MCP packages (docs.z.ai/devpack/mcp/*) installable into GrokBuild config.toml. */
export const ZAI_MCP_PACKAGE_IDS = ["vision", "web-search", "web-reader", "zread"] as const
export type ZaiMcpPackageId = (typeof ZAI_MCP_PACKAGE_IDS)[number]

export type ZaiMcpPackageSpec =
  | {
      readonly id: ZaiMcpPackageId
      readonly configName: string
      readonly kind: "stdio"
      readonly npmPackage: string
      readonly description: string
      readonly docsUrl: string
    }
  | {
      readonly id: ZaiMcpPackageId
      readonly configName: string
      readonly kind: "http"
      readonly url: string
      readonly description: string
      readonly docsUrl: string
    }

export const ZAI_MCP_PACKAGES: readonly ZaiMcpPackageSpec[] = [
  {
    id: "vision",
    configName: "zai-vision",
    kind: "stdio",
    npmPackage: "@z_ai/mcp-server",
    description: "Local Vision MCP (image/video analysis) via npx @z_ai/mcp-server",
    docsUrl: "https://docs.z.ai/devpack/mcp/vision-mcp-server",
  },
  {
    id: "web-search",
    configName: "zai-web-search",
    kind: "http",
    url: "https://api.z.ai/api/mcp/web_search_prime/mcp",
    description: "Remote Web Search MCP (webSearchPrime)",
    docsUrl: "https://docs.z.ai/devpack/mcp/search-mcp-server",
  },
  {
    id: "web-reader",
    configName: "zai-web-reader",
    kind: "http",
    url: "https://api.z.ai/api/mcp/web_reader/mcp",
    description: "Remote Web Reader MCP (webReader)",
    docsUrl: "https://docs.z.ai/devpack/mcp/reader-mcp-server",
  },
  {
    id: "zread",
    configName: "zai-zread",
    kind: "http",
    url: "https://api.z.ai/api/mcp/zread/mcp",
    description: "Remote Zread MCP (GitHub repo docs/code via zread.ai)",
    docsUrl: "https://docs.z.ai/devpack/mcp/zread-mcp-server",
  },
] as const

const LEDGER_BASENAME = "zai-mcp-packages.json"

export function isZaiMcpPackageId(value: string): value is ZaiMcpPackageId {
  return (ZAI_MCP_PACKAGE_IDS as readonly string[]).includes(value)
}

export function resolveZaiPackageSpecs(targets: readonly string[]): {
  readonly ok: true
  readonly specs: readonly ZaiMcpPackageSpec[]
} | {
  readonly ok: false
  readonly error: string
} {
  if (targets.length === 0 || targets.includes("all")) {
    return { ok: true, specs: ZAI_MCP_PACKAGES }
  }
  const specs: ZaiMcpPackageSpec[] = []
  for (const target of targets) {
    if (!isZaiMcpPackageId(target)) {
      return {
        ok: false,
        error: `Unknown Z.AI MCP package "${target}". Supported: ${[...ZAI_MCP_PACKAGE_IDS, "all"].join(", ")}`,
      }
    }
    const spec = ZAI_MCP_PACKAGES.find((item) => item.id === target)
    if (spec === undefined) {
      return { ok: false, error: `Unknown Z.AI MCP package "${target}"` }
    }
    if (!specs.some((item) => item.id === spec.id)) specs.push(spec)
  }
  return { ok: true, specs }
}

export async function installZaiMcpPackages(options: {
  readonly home?: string
  readonly env?: NodeJS.ProcessEnv
  readonly targets: readonly string[]
  readonly mode?: ZaiMode
}): Promise<{
  readonly ok: boolean
  readonly status: string
  readonly configPath: string
  readonly installed: readonly string[]
  readonly packages: readonly ReturnType<typeof packagePublicSummary>[]
  readonly error?: string
  readonly message: string
}> {
  const env = options.env ?? process.env
  const home = options.home ?? resolveGrokSetupHome(env)
  const configPath = join(home, ".grok", "config.toml")
  const resolved = resolveZaiPackageSpecs(options.targets)
  if (!resolved.ok) {
    return {
      ok: false,
      status: "zai_mcp_invalid_package",
      configPath,
      installed: [],
      packages: [],
      error: resolved.error,
      message: resolved.error,
    }
  }

  const credentials = await resolveZaiApiKey(env, home)
  if (credentials === null) {
    return {
      ok: false,
      status: "zai_mcp_auth_required",
      configPath,
      installed: [],
      packages: resolved.specs.map(packagePublicSummary),
      error: "Z.AI API key required",
      message: "Set credentials first: `lfg zai auth set-api-key` or export Z_AI_API_KEY.",
    }
  }
  const mode = options.mode ?? credentials.mode

  let toml = await readTextIfExists(configPath)
  for (const spec of resolved.specs) {
    toml = removeTomlSectionsByPrefix(toml, `mcp_servers.${spec.configName}`)
    toml = upsertZaiPackageSection(toml, spec, credentials.apiKey, mode)
  }
  await mkdir(dirname(configPath), { recursive: true })
  await writeFile(configPath, ensureTrailingNewline(toml), "utf8")
  await writeInstalledLedger(home, resolved.specs.map((spec) => spec.id))

  const installed = resolved.specs.map((spec) => spec.id)
  return {
    ok: true,
    status: "zai_mcp_installed",
    configPath,
    installed,
    packages: resolved.specs.map(packagePublicSummary),
    message: `Installed Z.AI MCP package(s) into ${configPath}: ${installed.join(", ")}. Reload Grok MCP (/mcps → r) or start a new session.`,
  }
}

export async function uninstallZaiMcpPackages(options: {
  readonly home?: string
  readonly env?: NodeJS.ProcessEnv
  readonly targets: readonly string[]
}): Promise<{
  readonly ok: boolean
  readonly status: string
  readonly configPath: string
  readonly removed: readonly string[]
  readonly message: string
  readonly error?: string
}> {
  const env = options.env ?? process.env
  const home = options.home ?? resolveGrokSetupHome(env)
  const configPath = join(home, ".grok", "config.toml")
  const resolved = resolveZaiPackageSpecs(options.targets)
  if (!resolved.ok) {
    return {
      ok: false,
      status: "zai_mcp_invalid_package",
      configPath,
      removed: [],
      message: resolved.error,
      error: resolved.error,
    }
  }

  let toml = await readTextIfExists(configPath)
  for (const spec of resolved.specs) {
    toml = removeTomlSectionsByPrefix(toml, `mcp_servers.${spec.configName}`)
  }
  await mkdir(dirname(configPath), { recursive: true })
  await writeFile(configPath, ensureTrailingNewline(toml), "utf8")

  const remaining = (await readInstalledLedger(home)).filter((id) => !resolved.specs.some((spec) => spec.id === id))
  await writeInstalledLedger(home, remaining)

  const removed = resolved.specs.map((spec) => spec.id)
  return {
    ok: true,
    status: "zai_mcp_uninstalled",
    configPath,
    removed,
    message: `Removed Z.AI MCP package(s) from ${configPath}: ${removed.join(", ")}.`,
  }
}

export async function getZaiMcpPackageStatus(options: {
  readonly home?: string
  readonly env?: NodeJS.ProcessEnv
} = {}): Promise<{
  readonly ok: boolean
  readonly status: string
  readonly configPath: string
  readonly catalog: readonly ReturnType<typeof packagePublicSummary>[]
  readonly configured: readonly string[]
  readonly ledger: readonly string[]
  readonly message: string
}> {
  const env = options.env ?? process.env
  const home = options.home ?? resolveGrokSetupHome(env)
  const configPath = join(home, ".grok", "config.toml")
  const toml = await readTextIfExists(configPath)
  const configured = ZAI_MCP_PACKAGES.filter((spec) => toml.includes(`[mcp_servers.${spec.configName}]`)).map((spec) => spec.id)
  const ledger = await readInstalledLedger(home)
  return {
    ok: true,
    status: "zai_mcp_status",
    configPath,
    catalog: ZAI_MCP_PACKAGES.map(packagePublicSummary),
    configured,
    ledger,
    message:
      configured.length === 0
        ? "No Z.AI MCP packages configured in Grok config.toml. Install with `lfg zai mcp install all`."
        : `Configured Z.AI MCP packages: ${configured.join(", ")}.`,
  }
}

export function packagePublicSummary(spec: ZaiMcpPackageSpec): {
  readonly id: string
  readonly configName: string
  readonly kind: string
  readonly description: string
  readonly docsUrl: string
  readonly npmPackage?: string
  readonly url?: string
} {
  if (spec.kind === "stdio") {
    return {
      id: spec.id,
      configName: spec.configName,
      kind: spec.kind,
      description: spec.description,
      docsUrl: spec.docsUrl,
      npmPackage: spec.npmPackage,
    }
  }
  return {
    id: spec.id,
    configName: spec.configName,
    kind: spec.kind,
    description: spec.description,
    docsUrl: spec.docsUrl,
    url: spec.url,
  }
}

function upsertZaiPackageSection(source: string, spec: ZaiMcpPackageSpec, apiKey: string, mode: ZaiMode): string {
  if (spec.kind === "stdio") {
    const main = upsertSection(source, `mcp_servers.${spec.configName}`, [
      `command = ${tomlString("npx")}`,
      "args = [",
      `    ${tomlString("-y")},`,
      `    ${tomlString(spec.npmPackage)},`,
      "]",
      "enabled = true",
    ])
    return upsertSection(main, `mcp_servers.${spec.configName}.env`, [
      `Z_AI_API_KEY = ${tomlString(apiKey)}`,
      `Z_AI_MODE = ${tomlString(mode)}`,
    ])
  }

  const main = upsertSection(source, `mcp_servers.${spec.configName}`, [
    `url = ${tomlString(spec.url)}`,
    "enabled = true",
  ])
  return upsertSection(main, `mcp_servers.${spec.configName}.headers`, [
    `Authorization = ${tomlString(`Bearer ${apiKey}`)}`,
  ])
}

function ledgerPath(home: string): string {
  return join(home, ".grok", ".ledger", "lfg", LEDGER_BASENAME)
}

async function readInstalledLedger(home: string): Promise<string[]> {
  try {
    const raw = await readFile(ledgerPath(home), "utf8")
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== "object" || parsed === null || !Array.isArray((parsed as { packages?: unknown }).packages)) {
      return []
    }
    return (parsed as { packages: unknown[] }).packages.filter((item): item is string => typeof item === "string")
  } catch {
    return []
  }
}

async function writeInstalledLedger(home: string, packages: readonly string[]): Promise<void> {
  const path = ledgerPath(home)
  await mkdir(dirname(path), { recursive: true })
  const body = `${JSON.stringify({ packages: [...packages], updatedAt: new Date().toISOString() }, null, 2)}\n`
  await writeFile(path, body, "utf8")
}

async function readTextIfExists(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8")
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "ENOENT") {
      return ""
    }
    throw error
  }
}

function ensureTrailingNewline(value: string): string {
  if (value.length === 0) return ""
  return value.endsWith("\n") ? value : `${value}\n`
}
