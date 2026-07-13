import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, test } from "vitest"
import { ensureXaiGrokMcpConfig, upsertXaiGrokMcpSection, XAI_GROK_MCP_CONFIG_NAME } from "./xai-mcp-config"

describe("xai-mcp-config (built-in Grok enhanced search)", () => {
  let home = ""

  afterEach(async () => {
    if (home.length > 0) await rm(home, { recursive: true, force: true })
  })

  test("upsert writes stdio command args and enabled flag", () => {
    const cli = "/tmp/plugin/mcp-runtimes/xai-grok-mcp/dist/cli.js"
    const toml = upsertXaiGrokMcpSection("", cli)
    expect(toml).toContain(`[mcp_servers.${XAI_GROK_MCP_CONFIG_NAME}]`)
    expect(toml).toContain('command = "node"')
    expect(toml).toContain(`"${cli}"`)
    expect(toml).toContain('"mcp"')
    expect(toml).toContain("enabled = true")
  })

  test("upsert replaces a stale xai_grok block without duplicating", () => {
    const stale = `[mcp_servers.xai_grok]
command = "npx"
args = ["old"]
enabled = false
`
    const cli = "/new/cli.js"
    const next = upsertXaiGrokMcpSection(stale, cli)
    expect(next.match(/\[mcp_servers\.xai_grok\]/g)).toHaveLength(1)
    expect(next).toContain(`"${cli}"`)
    expect(next).not.toContain("npx")
    expect(next).toContain("enabled = true")
  })

  test("ensure registers config when runtime exists under plugins/lfg", async () => {
    home = await mkdtemp(join(tmpdir(), "lfg-xai-mcp-config-"))
    const pluginRoot = join(home, ".grok", "plugins", "lfg")
    const runtimeCli = join(pluginRoot, "mcp-runtimes", "xai-grok-mcp", "dist", "cli.js")
    await mkdir(join(runtimeCli, ".."), { recursive: true })
    await writeFile(runtimeCli, "#!/usr/bin/env node\n", "utf8")
    // Marker so resolveGrokAdapterPluginRoot accepts the tree
    await writeFile(join(pluginRoot, "lfg-install.json"), JSON.stringify({ version: "test" }), "utf8")
    await mkdir(join(home, ".grok"), { recursive: true })
    await writeFile(join(home, ".grok", "config.toml"), "[models]\ndefault = \"grok-4.5\"\n", "utf8")

    const first = await ensureXaiGrokMcpConfig(home)
    expect(first.ok).toBe(true)
    expect(first.changed).toBe(true)
    expect(first.status).toBe("xai_mcp_registered")
    expect(first.runtimeCli).toBe(runtimeCli)

    const toml = await readFile(join(home, ".grok", "config.toml"), "utf8")
    expect(toml).toContain("[models]")
    expect(toml).toContain(`[mcp_servers.${XAI_GROK_MCP_CONFIG_NAME}]`)
    expect(toml).toContain(runtimeCli)

    const second = await ensureXaiGrokMcpConfig(home)
    expect(second.ok).toBe(true)
    expect(second.changed).toBe(false)
    expect(second.status).toBe("xai_mcp_already_registered")
  })

  test("ensure fails closed when runtime is missing", async () => {
    home = await mkdtemp(join(tmpdir(), "lfg-xai-mcp-missing-"))
    await mkdir(join(home, ".grok"), { recursive: true })
    const result = await ensureXaiGrokMcpConfig(home)
    expect(result.ok).toBe(false)
    expect(result.status).toBe("xai_mcp_runtime_missing")
    expect(result.changed).toBe(false)
  })
})
