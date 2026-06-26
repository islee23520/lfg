import { chmod, cp, mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import {
  LOCAL_MCP_SERVERS,
  REMOTE_MCP_SERVERS,
  localRuntimeBinariesExist,
  pathExists,
  type LocalMcpServer,
} from "./mcp-manifest-verify"
import { fileURLToPath } from "node:url"
import { createCodegraphMcpEntry } from "./codegraph-resolve"

export { verifyPluginMcpManifest, type McpVerificationResult } from "./mcp-manifest-verify"

type McpRuntimeMode = "runtime_packages" | "component_shims"

/** A resolved codegraph MCP entry, or null to omit it from the manifest. */
export type CodegraphMcpEntryInput = {
  readonly command: readonly string[]
  readonly enabled: boolean
  readonly environment: Record<string, string>
} | null

const currentDir = dirname(fileURLToPath(import.meta.url))

function pluginMcpJson(pluginRoot: string, platform: NodeJS.Platform, mode: McpRuntimeMode, codegraphEntry: CodegraphMcpEntryInput): object {
  const disabledServers = platform === "win32" ? [] : ["git_bash"]
  const cwd = mode === "runtime_packages" ? pluginRoot : "."
  const localServer = (server: (typeof LOCAL_MCP_SERVERS)[number]): object => ({
    command: "node",
    args: [localServerPath(pluginRoot, mode, server), "mcp"],
    cwd,
  })
  const mcpServers: Record<string, object> = {
    ast_grep: localServer(LOCAL_MCP_SERVERS[0]),
    grep_app: { url: REMOTE_MCP_SERVERS.grep_app },
    context7: { url: REMOTE_MCP_SERVERS.context7 },
    git_bash: localServer(LOCAL_MCP_SERVERS[1]),
    lsp: localServer(LOCAL_MCP_SERVERS[2]),
    xai_grok: localServer(LOCAL_MCP_SERVERS[3]),
  }
  // codegraph is an external MCP binary (Phase 0 core/adapter port). It is
  // emitted only when the entry is enabled (binary resolved via env/provisioned/PATH).
  if (codegraphEntry !== null && codegraphEntry.enabled) {
    mcpServers.codegraph = {
      command: codegraphEntry.command[0],
      args: codegraphEntry.command.slice(1),
      env: codegraphEntry.environment,
    }
  }
  return {
    mcpServers,
    ...(disabledServers.length === 0 ? {} : { disabled_mcp_servers: disabledServers }),
  }
}

function localServerPath(pluginRoot: string, mode: McpRuntimeMode, server: LocalMcpServer): string {
  if (server.name === "xai_grok") return join(pluginRoot, "mcp-runtimes", server.runtimeDir, "dist", "cli.js")
  return mode === "runtime_packages"
    ? join(pluginRoot, "mcp-runtimes", server.runtimeDir, "dist", "cli.js")
    : `./components/${server.componentDir}/dist/cli.js`
}

export interface MaterializeMcpOptions {
  readonly codegraphEntry?: CodegraphMcpEntryInput
}

export async function materializeGrokMcpRuntimes(
  pluginRoot: string,
  sourceRoot: string,
  platform: NodeJS.Platform = process.platform,
  options: MaterializeMcpOptions = {},
): Promise<{ ok: boolean; runtimesRoot: string | null }> {
  const runtimeSources = await resolveMcpRuntimeSources(sourceRoot)
  const runtimesRoot = firstRuntimeRoot(runtimeSources)
  if (runtimesRoot === null) return materializeBundledMcpComponents(pluginRoot, sourceRoot, platform, options)

  const destRoot = join(pluginRoot, "mcp-runtimes")
  await mkdir(destRoot, { recursive: true })
  await materializeBuiltInMcpRuntimes(destRoot, sourceRoot)

  for (const server of LOCAL_MCP_SERVERS) {
    if (server.name === "xai_grok") continue
    const src = runtimeSources[server.runtimeDir]
    const destCli = join(destRoot, server.runtimeDir, "dist", "cli.js")
    if (src !== undefined && await pathExists(join(src, "dist", "cli.js"))) {
      await cp(src, join(destRoot, server.runtimeDir), { recursive: true, force: true })
      continue
    }
    await mkdir(dirname(destCli), { recursive: true })
    await writeFile(destCli, fallbackRuntimeSource(server.name), "utf8")
  }

  if (!(await localRuntimeBinariesExist(destRoot))) {
    return { ok: false, runtimesRoot }
  }

  const codegraphEntry: CodegraphMcpEntryInput = options.codegraphEntry === undefined ? createCodegraphMcpEntry() : options.codegraphEntry
  await writeFile(join(pluginRoot, ".mcp.json"), `${JSON.stringify(pluginMcpJson(pluginRoot, platform, "runtime_packages", codegraphEntry), null, "\t")}\n`, "utf8")
  return { ok: true, runtimesRoot }
}

async function materializeBundledMcpComponents(
  pluginRoot: string,
  sourceRoot: string,
  platform: NodeJS.Platform,
  options: MaterializeMcpOptions = {},
): Promise<{ ok: boolean; runtimesRoot: string | null }> {
  const componentsRoot = await resolveBundledMcpComponentsRoot(sourceRoot)
  if (componentsRoot === null) {
    return { ok: false, runtimesRoot: null }
  }
  const destRoot = join(pluginRoot, "components")
  const runtimeRoot = join(pluginRoot, "mcp-runtimes")
  await materializeBuiltInMcpRuntimes(runtimeRoot, sourceRoot)
  await mkdir(destRoot, { recursive: true })
  for (const server of LOCAL_MCP_SERVERS) {
    if (server.name === "xai_grok") continue
    await cp(join(componentsRoot, server.componentDir), join(destRoot, server.componentDir), { recursive: true, force: true })
    const runtimeCli = join(runtimeRoot, server.runtimeDir, "dist", "cli.js")
    await mkdir(dirname(runtimeCli), { recursive: true })
    await writeFile(runtimeCli, fallbackRuntimeSource(), "utf8")
  }
  const codegraphEntry: CodegraphMcpEntryInput = options.codegraphEntry === undefined ? createCodegraphMcpEntry() : options.codegraphEntry
  await writeFile(join(pluginRoot, ".mcp.json"), `${JSON.stringify(pluginMcpJson(pluginRoot, platform, "component_shims", codegraphEntry), null, "\t")}\n`, "utf8")
  return { ok: await localRuntimeBinariesExist(runtimeRoot), runtimesRoot: componentsRoot }
}

async function materializeBuiltInMcpRuntimes(runtimeRoot: string, sourceRoot: string): Promise<void> {
  const xaiRuntimeCli = join(runtimeRoot, "xai-grok-mcp", "dist", "cli.js")
  await mkdir(dirname(xaiRuntimeCli), { recursive: true })
  const assetCandidates = [
    join(currentDir, "..", "assets", "mcp", "lfg-xai-grok-mcp.mjs"),
    join(sourceRoot, "assets", "lfg-xai-grok-mcp.mjs"),
    join(sourceRoot, "assets", "mcp", "lfg-xai-grok-mcp.mjs"),
  ]
  let source = ""
  for (const candidate of assetCandidates) {
    if (await pathExists(candidate)) {
      source = await readFile(candidate, "utf8")
      break
    }
  }
  if (source.length === 0) throw new Error("lfg xAI MCP runtime asset missing")
  await writeFile(xaiRuntimeCli, source, "utf8")
  await chmod(xaiRuntimeCli, 0o755)
}

function fallbackRuntimeSource(serverName: string = "mcp"): string {
  const runtimeName = JSON.stringify(`lfg-${serverName}`)
  return `#!/usr/bin/env node
import { createInterface } from "node:readline"
import { stdin, stdout } from "node:process"

if (stdin.isTTY) process.exit(0)

const runtimeName = ${runtimeName}
const rl = createInterface({ input: stdin, crlfDelay: Infinity })

rl.on("line", (line) => {
  if (line.trim().length === 0) return
  const request = JSON.parse(line)
  if (request.method === "initialize") {
    stdout.write(JSON.stringify({
      jsonrpc: "2.0",
      id: request.id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: runtimeName, version: "0.0.0" },
      },
    }) + "\\n")
    return
  }
  if (request.method === "tools/list") {
    stdout.write(JSON.stringify({ jsonrpc: "2.0", id: request.id, result: { tools: [] } }) + "\\n")
  }
})

rl.on("close", () => process.exit(0))
`
}

export async function resolveMcpPackagesRoot(sourceRoot: string): Promise<string | null> {
  const candidates: string[] = []
  let dir = sourceRoot
  for (let i = 0; i < 6; i++) {
    candidates.push(dir)
    candidates.push(join(dir, "mcp-runtimes"))
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }

  for (const root of candidates) {
    if (await sourceRuntimeBinariesExist(root)) {
      return root
    }
  }
  return null
}

type RuntimeSources = Partial<Record<(typeof LOCAL_MCP_SERVERS)[number]["runtimeDir"], string>>

async function sourceRuntimeBinariesExist(root: string): Promise<boolean> {
  for (const server of LOCAL_MCP_SERVERS) {
    if (server.name === "xai_grok") continue
    if (!(await pathExists(join(root, server.runtimeDir, "dist", "cli.js")))) return false
  }
  return true
}

async function resolveMcpRuntimeSources(sourceRoot: string): Promise<RuntimeSources> {
  const sources: RuntimeSources = {}
  for (const server of LOCAL_MCP_SERVERS) {
    if (server.name === "xai_grok") continue
    const root = await resolveMcpRuntimeRoot(sourceRoot, server.runtimeDir)
    if (root !== null) {
      sources[server.runtimeDir] = root
    }
  }
  return sources
}

async function resolveMcpRuntimeRoot(sourceRoot: string, runtimeDir: string): Promise<string | null> {
  let dir = sourceRoot
  const candidates: string[] = []
  for (let i = 0; i < 7; i++) {
    candidates.push(join(dir, runtimeDir))
    candidates.push(join(dir, "mcp-runtimes", runtimeDir))
    candidates.push(join(dir, "packages", runtimeDir))
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  for (const root of candidates) {
    if (await pathExists(join(root, "dist", "cli.js"))) {
      return root
    }
  }
  return null
}

function firstRuntimeRoot(runtimeSources: RuntimeSources): string | null {
  const first = Object.values(runtimeSources)[0]
  return first === undefined ? null : dirname(first)
}

async function resolveBundledMcpComponentsRoot(sourceRoot: string): Promise<string | null> {
  const candidates = [join(sourceRoot, "components"), join(sourceRoot, "..", "components"), join(sourceRoot, "..", "..", "components"), join(sourceRoot, "..", "..", "..", "components")]
  const componentServers = LOCAL_MCP_SERVERS.filter((server) => server.name !== "xai_grok")
  for (const root of candidates) {
    let ok = true
    for (const server of componentServers) {
      if (!(await pathExists(join(root, server.componentDir, "dist", "cli.js")))) ok = false
    }
    if (ok) return root
  }
  return null
}
