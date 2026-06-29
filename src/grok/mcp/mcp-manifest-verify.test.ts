import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, test } from "vitest"
import { materializeGrokMcpRuntimes, verifyPluginMcpManifest } from "./materialize-grok-mcp"
import { createMcpPackageFixture } from "../test/materialize-grok-mcp.test-helpers"

describe("verifyPluginMcpManifest", () => {
  let pluginRoot = ""
  let sourceRoot = ""

  afterEach(async () => {
    if (pluginRoot.length > 0) await rm(pluginRoot, { recursive: true, force: true })
    if (sourceRoot.length > 0) await rm(sourceRoot, { recursive: true, force: true })
  })

  test("verifies package-shaped grok-install payload with bundled MCP shims", async () => {
    const packageRoot = await mkdtemp(join(tmpdir(), "lfg-mcp-package-root-"))
    sourceRoot = packageRoot
    const installSource = join(packageRoot, "dist", "grok-install")
    await mkdir(join(packageRoot, "dist"), { recursive: true })
    await cp(join(process.cwd(), "dist", "grok-install"), installSource, { recursive: true })
    pluginRoot = await mkdtemp(join(tmpdir(), "lfg-mcp-package-shaped-"))
    const result = await materializeGrokMcpRuntimes(pluginRoot, installSource, "darwin")
    expect(result.ok).toBe(true)
    const verification = await verifyPluginMcpManifest(pluginRoot, "darwin")
    expect(verification).toMatchObject({
      ok: true,
      gitBash: "manifest_only_disabled_non_windows",
    })
  })

  test("verifies remote MCP URLs by manifest shape without network calls", async () => {
    sourceRoot = await createMcpPackageFixture()
    pluginRoot = await mkdtemp(join(tmpdir(), "lfg-mcp-verify-"))
    await materializeGrokMcpRuntimes(pluginRoot, join(sourceRoot, "omo-codex", "plugin"), "darwin")
    const result = await verifyPluginMcpManifest(pluginRoot, "darwin")
    expect(result).toMatchObject({
      ok: true,
      remoteLiveCalls: false,
      gitBash: "manifest_only_disabled_non_windows",
      windowsExecution: "unverified_no_windows_runner",
    })
  })

  test("does not report git_bash as verified Windows behavior", async () => {
    sourceRoot = await createMcpPackageFixture()
    pluginRoot = await mkdtemp(join(tmpdir(), "lfg-mcp-win-status-"))
    await materializeGrokMcpRuntimes(pluginRoot, join(sourceRoot, "omo-codex", "plugin"), "win32")

    const result = await verifyPluginMcpManifest(pluginRoot, "win32")

    expect(result).toMatchObject({
      ok: true,
      gitBash: "manifest_only_windows_unverified",
      windowsExecution: "unverified_no_windows_runner",
    })
    expect(result.errors).toEqual([])
  })

  test("rejects malformed MCP manifest input", async () => {
    pluginRoot = await mkdtemp(join(tmpdir(), "lfg-mcp-bad-"))
    await writeFile(join(pluginRoot, ".mcp.json"), '{"mcpServers":{"grep_app":{"url":"not-a-url"}}}\n', "utf8")
    const result = await verifyPluginMcpManifest(pluginRoot, "darwin")
    expect(result.ok).toBe(false)
    expect(result.errors).toContain("mcpServers.ast_grep missing")
    expect(result.errors).toContain("mcpServers.grep_app.url must be https URL")
  })
})
