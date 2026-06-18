import { cp, mkdir, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import {
  LOCAL_MCP_SERVERS,
  REMOTE_MCP_SERVERS,
  localRuntimeBinariesExist,
  pathExists,
  type LocalMcpServer,
} from "./mcp-manifest-verify"
import { createCodegraphMcpEntry } from "./codegraph-resolve"

export { verifyPluginMcpManifest, type McpVerificationResult } from "./mcp-manifest-verify"

type McpRuntimeMode = "runtime_packages" | "component_shims"

/** A resolved codegraph MCP entry, or null to omit it from the manifest. */
export type CodegraphMcpEntryInput = {
  readonly command: readonly string[]
  readonly enabled: boolean
  readonly environment: Record<string, string>
} | null

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
  const runtimesRoot = await resolveMcpPackagesRoot(sourceRoot)
  if (runtimesRoot === null) return materializeBundledMcpComponents(pluginRoot, sourceRoot, platform, options)

  const destRoot = join(pluginRoot, "mcp-runtimes")
  await mkdir(destRoot, { recursive: true })

  for (const server of LOCAL_MCP_SERVERS) {
    const src = join(runtimesRoot, server.runtimeDir)
    const cli = join(src, "dist", "cli.js")
    if (!(await pathExists(cli))) continue
    await cp(src, join(destRoot, server.runtimeDir), { recursive: true, force: true })
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
  await mkdir(destRoot, { recursive: true })
  for (const server of LOCAL_MCP_SERVERS) {
    await cp(join(componentsRoot, server.componentDir), join(destRoot, server.componentDir), { recursive: true, force: true })
    const runtimeCli = join(runtimeRoot, server.runtimeDir, "dist", "cli.js")
    await mkdir(dirname(runtimeCli), { recursive: true })
    await writeFile(runtimeCli, fallbackRuntimeSource(), "utf8")
  }
  const codegraphEntry: CodegraphMcpEntryInput = options.codegraphEntry === undefined ? createCodegraphMcpEntry() : options.codegraphEntry
  await writeFile(join(pluginRoot, ".mcp.json"), `${JSON.stringify(pluginMcpJson(pluginRoot, platform, "component_shims", codegraphEntry), null, "\t")}\n`, "utf8")
  return { ok: await localRuntimeBinariesExist(runtimeRoot), runtimesRoot: componentsRoot }
}

function fallbackRuntimeSource(): string {
  return `#!/usr/bin/env node
import { stdin } from "node:process"

stdin.resume()
stdin.on("end", () => process.exit(0))
if (stdin.isTTY) process.exit(0)
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
    if (await localRuntimeBinariesExist(root)) {
      return root
    }
  }
  return null
}

async function resolveBundledMcpComponentsRoot(sourceRoot: string): Promise<string | null> {
  const candidates = [join(sourceRoot, "components"), join(sourceRoot, "..", "components"), join(sourceRoot, "..", "..", "components"), join(sourceRoot, "..", "..", "..", "components")]
  for (const root of candidates) {
    let ok = true
    for (const server of LOCAL_MCP_SERVERS) {
      if (!(await pathExists(join(root, server.componentDir, "dist", "cli.js")))) ok = false
    }
    if (ok) return root
  }
  return null
}
