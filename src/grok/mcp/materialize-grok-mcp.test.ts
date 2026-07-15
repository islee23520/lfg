import { spawnSync } from "node:child_process"
import { cp, mkdir, mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, test } from "vitest"
import { materializeGrokMcpRuntimes, resolveMcpPackagesRoot, verifyPluginMcpManifest } from "./materialize-grok-mcp"
import {
  createComponentShimFixture,
  createMcpPackageFixture,
  createRuntimePackage,
  runMcpProbe,
} from "../test/materialize-grok-mcp.test-helpers"

describe("materializeGrokMcpRuntimes", () => {
  let pluginRoot = ""
  let sourceRoot = ""

  afterEach(async () => {
    if (pluginRoot.length > 0) await rm(pluginRoot, { recursive: true, force: true })
    if (sourceRoot.length > 0) await rm(sourceRoot, { recursive: true, force: true })
  })

  test("resolves MCP packages from plugin source ancestor", async () => {
    sourceRoot = await createMcpPackageFixture()
    const root = await resolveMcpPackagesRoot(join(sourceRoot, "omo-codex", "plugin"))
    expect(root).toBe(sourceRoot)
  })

  test("writes all upstream MCP servers with local binaries and remote URLs", async () => {
    sourceRoot = await createMcpPackageFixture()
    pluginRoot = await mkdtemp(join(tmpdir(), "lfg-mcp-mat-"))
    const result = await materializeGrokMcpRuntimes(pluginRoot, join(sourceRoot, "omo-codex", "plugin"), "darwin", {
      codegraphEntry: null,
    })
    expect(result.ok).toBe(true)
    const mcp = JSON.parse(
      await readFile(join(pluginRoot, ".mcp.json"), "utf8"),
    ) as { mcpServers: Record<string, { args?: readonly string[]; cwd?: string; url?: string }>; disabled_mcp_servers?: readonly string[] }
    expect(Object.keys(mcp.mcpServers).sort()).toEqual(["ast_grep", "context7", "eval", "git_bash", "grep_app", "lsp", "xai_grok"])
    expect(mcp.mcpServers.ast_grep?.args?.[0]).toBe(join(pluginRoot, "mcp-runtimes", "ast-grep-mcp", "dist", "cli.js"))
    expect(mcp.mcpServers.ast_grep?.cwd).toBe(pluginRoot)
    expect(mcp.mcpServers.git_bash?.args?.[0]).toBe(join(pluginRoot, "mcp-runtimes", "git-bash-mcp", "dist", "cli.js"))
    expect(mcp.disabled_mcp_servers).toEqual(["git_bash"])
    expect(mcp.mcpServers.lsp?.args?.[0]).toBe(join(pluginRoot, "mcp-runtimes", "lsp-daemon", "dist", "cli.js"))
    expect(mcp.mcpServers.lsp?.cwd).toBe(pluginRoot)
    expect(mcp.mcpServers.xai_grok?.args?.[0]).toBe(join(pluginRoot, "mcp-runtimes", "xai-grok-mcp", "dist", "cli.js"))
    expect(mcp.mcpServers.xai_grok?.cwd).toBe(pluginRoot)
    expect(mcp.mcpServers.grep_app?.url).toBe("https://mcp.grep.app")
    expect(mcp.mcpServers.context7?.url).toBe("https://mcp.context7.com/mcp")
    expect(JSON.stringify(mcp)).not.toContain("installed-src")
  })

  test("emits codegraph MCP entry when an enabled codegraph binary resolves", async () => {
    sourceRoot = await createMcpPackageFixture()
    pluginRoot = await mkdtemp(join(tmpdir(), "lfg-mcp-codegraph-"))
    const result = await materializeGrokMcpRuntimes(pluginRoot, join(sourceRoot, "omo-codex", "plugin"), "darwin", {
      codegraphEntry: {
        enabled: true,
        command: ["/opt/codegraph/bin/codegraph", "serve", "--mcp"],
        environment: { CODEGRAPH_INSTALL_DIR: "/home/user/.omo/codegraph", CODEGRAPH_TELEMETRY: "0" },
      },
    })
    expect(result.ok).toBe(true)
    const mcp = JSON.parse(
      await readFile(join(pluginRoot, ".mcp.json"), "utf8"),
    ) as { mcpServers: Record<string, { command: string; args: readonly string[]; env: Record<string, string> }> }
    expect(mcp.mcpServers.codegraph).toBeDefined()
    expect(mcp.mcpServers.codegraph?.command).toBe("/opt/codegraph/bin/codegraph")
    expect(mcp.mcpServers.codegraph?.args).toStrictEqual(["serve", "--mcp"])
    expect(mcp.mcpServers.codegraph?.env.CODEGRAPH_TELEMETRY).toBe("0")
  })

  test("omits codegraph when the binary does not resolve", async () => {
    sourceRoot = await createMcpPackageFixture()
    pluginRoot = await mkdtemp(join(tmpdir(), "lfg-mcp-no-codegraph-"))
    const result = await materializeGrokMcpRuntimes(pluginRoot, join(sourceRoot, "omo-codex", "plugin"), "darwin", {
      codegraphEntry: { enabled: false, command: ["codegraph", "serve", "--mcp"], environment: {} },
    })
    expect(result.ok).toBe(true)
    const mcp = JSON.parse(await readFile(join(pluginRoot, ".mcp.json"), "utf8")) as { mcpServers: Record<string, unknown> }
    expect(mcp.mcpServers.codegraph).toBeUndefined()
  })

  test("uses fallback runtime packages when one upstream MCP binary is missing", async () => {
    sourceRoot = await createMcpPackageFixture(["git-bash-mcp"])
    pluginRoot = await mkdtemp(join(tmpdir(), "lfg-mcp-mat-missing-"))
    const result = await materializeGrokMcpRuntimes(pluginRoot, join(sourceRoot, "omo-codex", "plugin"), "darwin")
    expect(result.ok).toBe(true)
    const responses = await runMcpProbe(join(pluginRoot, "mcp-runtimes", "git-bash-mcp", "dist", "cli.js"))
    expect(responses.stderr).toBe("")
    expect(responses.messages).toContainEqual(
      expect.objectContaining({
        id: 1,
        result: expect.objectContaining({
          capabilities: { tools: {} },
          serverInfo: { name: "lfg-git_bash", version: "0.0.0" },
        }),
      }),
    )
    expect(responses.messages).toContainEqual({ jsonrpc: "2.0", id: 2, result: { tools: [] } })
  })

  test("accepts bundled component shims with generated package runtime targets", async () => {
    sourceRoot = await mkdtemp(join(tmpdir(), "lfg-mcp-bundled-"))
    const installSource = join(sourceRoot, "dist", "grok-install")
    const packageRoot = sourceRoot
    await mkdir(installSource, { recursive: true })
    await createComponentShimFixture(packageRoot)
    pluginRoot = await mkdtemp(join(tmpdir(), "lfg-mcp-components-"))
    const result = await materializeGrokMcpRuntimes(pluginRoot, installSource, "darwin")
    expect(result.ok).toBe(true)
    const mcp = JSON.parse(
      await readFile(join(pluginRoot, ".mcp.json"), "utf8"),
    ) as { mcpServers: Record<string, { args?: readonly string[]; cwd?: string }>; disabled_mcp_servers?: readonly string[] }
    expect(mcp.mcpServers.ast_grep?.args?.[0]).toBe("./components/ast-grep/dist/cli.js")
    expect(mcp.mcpServers.git_bash?.args?.[0]).toBe("./components/git-bash/dist/cli.js")
    expect(mcp.mcpServers.lsp?.args?.[0]).toBe("./components/lsp/dist/cli.js")
    expect(mcp.disabled_mcp_servers).toEqual(["git_bash"])
    const verification = await verifyPluginMcpManifest(pluginRoot, "darwin")
    expect(verification.ok).toBe(true)
    expect(verification.errors).not.toContain("mcpServers.ast_grep.runtime target missing")
  })

  test("uses available lazycodex package MCP runtimes and replaces non-diagnostics lsp", async () => {
    const packageRoot = await mkdtemp(join(tmpdir(), "lfg-mcp-lazycodex-package-"))
    sourceRoot = packageRoot
    const installSource = join(packageRoot, "packages", "omo-codex", "plugin")
    await mkdir(installSource, { recursive: true })
    await createComponentShimFixture(join(packageRoot, "packages", "omo-codex", "plugin"))
    await createRuntimePackage(packageRoot, "git-bash-mcp", "git_bash")
    await createRuntimePackage(packageRoot, "lsp-daemon", "lsp")
    pluginRoot = await mkdtemp(join(tmpdir(), "lfg-mcp-lazycodex-installed-"))

    const result = await materializeGrokMcpRuntimes(pluginRoot, installSource, "darwin")

    expect(result.ok).toBe(true)
    const mcp = JSON.parse(
      await readFile(join(pluginRoot, ".mcp.json"), "utf8"),
    ) as { mcpServers: Record<string, { args?: readonly string[]; cwd?: string }>; disabled_mcp_servers?: readonly string[] }
    expect(mcp.mcpServers.ast_grep?.args?.[0]).toBe(join(pluginRoot, "mcp-runtimes", "ast-grep-mcp", "dist", "cli.js"))
    expect(mcp.mcpServers.git_bash?.args?.[0]).toBe(join(pluginRoot, "mcp-runtimes", "git-bash-mcp", "dist", "cli.js"))
    expect(mcp.mcpServers.lsp?.args?.[0]).toBe(join(pluginRoot, "mcp-runtimes", "lsp-daemon", "dist", "cli.js"))
    await expect(readFile(join(pluginRoot, "mcp-runtimes", "git-bash-mcp", "dist", "cli.js"), "utf8")).resolves.toContain("upstream-git_bash")
    await expect(readFile(join(pluginRoot, "mcp-runtimes", "lsp-daemon", "dist", "cli.js"), "utf8")).resolves.toContain("typescript_diagnostics")
    const fallbackResponses = await runMcpProbe(join(pluginRoot, "mcp-runtimes", "ast-grep-mcp", "dist", "cli.js"))
    expect(fallbackResponses.stderr).toBe("")
    expect(fallbackResponses.messages).toContainEqual(
      expect.objectContaining({
        id: 1,
        result: expect.objectContaining({
          capabilities: { tools: {} },
          serverInfo: { name: "lfg-ast_grep", version: "0.1.0" },
        }),
      }),
    )
    expect(fallbackResponses.messages).toContainEqual(
      expect.objectContaining({
        id: 2,
        result: expect.objectContaining({
          tools: expect.arrayContaining([expect.objectContaining({ name: "ast_grep_search" })]),
        }),
      }),
    )
    const lspResponses = await runMcpProbe(join(pluginRoot, "mcp-runtimes", "lsp-daemon", "dist", "cli.js"))
    expect(lspResponses.stderr).toBe("")
    expect(lspResponses.messages).toContainEqual(
      expect.objectContaining({
        id: 2,
        result: expect.objectContaining({
          tools: expect.arrayContaining([expect.objectContaining({ name: "typescript_diagnostics" })]),
        }),
      }),
    )
    const verification = await verifyPluginMcpManifest(pluginRoot, "darwin")
    expect(verification.ok).toBe(true)
  })

  test("starts package-shaped MCP component shims after materialization", async () => {
    const packageRoot = await mkdtemp(join(tmpdir(), "lfg-mcp-runtime-package-root-"))
    sourceRoot = packageRoot
    const installSource = join(packageRoot, "dist", "grok-install")
    await mkdir(join(packageRoot, "dist"), { recursive: true })
    await cp(join(process.cwd(), "dist", "grok-install"), installSource, { recursive: true })
    pluginRoot = await mkdtemp(join(tmpdir(), "lfg-mcp-runtime-package-shaped-"))
    await cp(installSource, pluginRoot, { recursive: true, force: true })
    const result = await materializeGrokMcpRuntimes(pluginRoot, installSource, "darwin")
    expect(result.ok).toBe(true)

    for (const component of ["ast-grep", "git-bash", "lsp"] as const) {
      const shim = join(pluginRoot, "components", component, "dist", "cli.js")
      const startup = spawnSync(process.execPath, [shim, "mcp"], { encoding: "utf8", input: "" })
      expect(startup.status, startup.stderr).toBe(0)
      expect(startup.stderr).not.toContain("Cannot find module")
    }
  })
})
