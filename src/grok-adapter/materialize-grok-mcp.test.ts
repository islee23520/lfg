import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, test } from "vitest"
import { materializeGrokMcpRuntimes, resolveMcpPackagesRoot } from "./materialize-grok-mcp"

describe("materializeGrokMcpRuntimes", () => {
  let pluginRoot: string

  afterEach(async () => {
    if (pluginRoot) await rm(pluginRoot, { recursive: true, force: true })
  })

  test("resolves MCP packages from lazycodex plugin source ancestor", async () => {
    const npxPlugin = join(
      process.env.HOME ?? "",
      ".npm",
      "_npx",
      "c53733242e702b2e",
      "node_modules",
      "lazycodex-ai",
      "packages",
      "omo-codex",
      "plugin",
    )
    const root = await resolveMcpPackagesRoot(npxPlugin)
    expect(root).not.toBeNull()
    expect(root).toMatch(/lazycodex-ai\/packages$/)
  })

  test("writes mcp-runtimes and absolute plugin .mcp.json paths", async () => {
    const npxPlugin = join(
      process.env.HOME ?? "",
      ".npm",
      "_npx",
      "c53733242e702b2e",
      "node_modules",
      "lazycodex-ai",
      "packages",
      "omo-codex",
      "plugin",
    )
    pluginRoot = await mkdtemp(join(tmpdir(), "lfg-mcp-mat-"))
    const result = await materializeGrokMcpRuntimes(pluginRoot, npxPlugin)
    expect(result.ok).toBe(true)
    const mcp = JSON.parse(
      await readFile(join(pluginRoot, ".mcp.json"), "utf8"),
    ) as { mcpServers: Record<string, { args?: string[]; cwd?: string }> }
    expect(mcp.mcpServers.ast_grep?.args?.[0]).toBe(join(pluginRoot, "mcp-runtimes", "ast-grep-mcp", "dist", "cli.js"))
    expect(mcp.mcpServers.ast_grep?.cwd).toBe(pluginRoot)
    expect(mcp.mcpServers.lsp?.args?.[0]).toBe(join(pluginRoot, "mcp-runtimes", "lsp-daemon", "dist", "cli.js"))
    expect(mcp.mcpServers.lsp?.cwd).toBe(pluginRoot)
    expect(JSON.stringify(mcp)).not.toContain("installed-src")
  })
})