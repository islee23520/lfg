import { access, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { LazycodexAdapter } from "./lfg-grok"
import { isRecord, readJsonObject } from "./lfg-json"

type McpServerName = "ast_grep" | "lsp"

type McpServerSpec = {
  readonly name: McpServerName
  readonly componentDir: string
}

type McpServerTarget = McpServerSpec & {
  readonly cliPath: string
  readonly exists: boolean
}

export type McpConfigRepair =
  | {
      readonly status: "missing_adapter"
      readonly path: string
    }
  | {
      readonly status: "missing_components"
      readonly path: string
      readonly missing: readonly McpServerName[]
    }
  | {
      readonly status: "not_needed"
      readonly path: string
      readonly servers: readonly McpServerName[]
    }
  | {
      readonly status: "repaired"
      readonly path: string
      readonly servers: readonly McpServerName[]
    }
  | {
      readonly status: "error"
      readonly path: string
      readonly error: string
    }

const MCP_SERVER_SPECS: readonly McpServerSpec[] = [
  { name: "ast_grep", componentDir: "ast-grep-mcp" },
  { name: "lsp", componentDir: "lsp-tools-mcp" },
] as const

export async function repairLazycodexMcpConfig(adapter: LazycodexAdapter): Promise<McpConfigRepair> {
  try {
    return await repairLazycodexMcpConfigUnsafe(adapter)
  } catch (error) {
    return { status: "error", path: adapter.mcpConfig, error: error instanceof Error ? error.message : String(error) }
  }
}

async function repairLazycodexMcpConfigUnsafe(adapter: LazycodexAdapter): Promise<McpConfigRepair> {
  if (!adapter.found) return { status: "missing_adapter", path: adapter.mcpConfig }
  const targets = await resolveTargets(adapter.root)
  const missing = targets.filter((target) => !target.exists).map((target) => target.name)
  if (missing.length > 0) return { status: "missing_components", path: adapter.mcpConfig, missing }

  const config = await readJsonObject(adapter.mcpConfig)
  const existingServers = isRecord(config.mcpServers) ? config.mcpServers : {}
  const nextServers: Record<string, unknown> = { ...existingServers }
  const repairedServers: McpServerName[] = []

  for (const target of targets) {
    const expected = expectedMcpServer(target.cliPath)
    if (!sameMcpServer(existingServers[target.name], expected)) repairedServers.push(target.name)
    nextServers[target.name] = expected
  }

  if (repairedServers.length === 0) return { status: "not_needed", path: adapter.mcpConfig, servers: targets.map((target) => target.name) }
  await writeFile(adapter.mcpConfig, `${JSON.stringify({ ...config, mcpServers: nextServers }, null, 2)}\n`)
  return { status: "repaired", path: adapter.mcpConfig, servers: repairedServers }
}

async function resolveTargets(adapterRoot: string): Promise<readonly McpServerTarget[]> {
  return Promise.all(
    MCP_SERVER_SPECS.map(async (spec) => {
      const cliPath = join(adapterRoot, "components", spec.componentDir, "dist", "cli.js")
      return { ...spec, cliPath, exists: await pathExists(cliPath) }
    }),
  )
}

function expectedMcpServer(cliPath: string): { readonly command: "node"; readonly args: readonly [string, "mcp"] } {
  return { command: "node", args: [cliPath, "mcp"] }
}

function sameMcpServer(value: unknown, expected: { readonly command: string; readonly args: readonly string[] }): boolean {
  if (!isRecord(value)) return false
  if (value.command !== expected.command) return false
  if (!Array.isArray(value.args)) return false
  return value.args.length === expected.args.length && value.args.every((arg, index) => arg === expected.args[index])
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch (error) {
    if (error instanceof Error) return false
    throw error
  }
}
