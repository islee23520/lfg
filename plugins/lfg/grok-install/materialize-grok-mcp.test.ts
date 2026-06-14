import { mkdtemp, rm } from "node:fs/promises"
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

  test("writes mcp-runtimes and plugin-relative .mcp.json", async () => {
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
      await (await import("node:fs/promises")).readFile(join(pluginRoot, ".mcp.json"), "utf8"),
    ) as { mcpServers: Record<string, { args?: string[] }> }
    expect(mcp.mcpServers.ast_grep?.args?.[0]).toBe("./mcp-runtimes/ast-grep-mcp/dist/cli.js")
    expect(mcp.mcpServers.lsp?.args?.[0]).toBe("./mcp-runtimes/lsp-daemon/dist/cli.js")
  })
})