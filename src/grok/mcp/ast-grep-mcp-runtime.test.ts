import { spawnSync } from "node:child_process"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, test } from "vitest"
import { materializeGrokMcpRuntimes } from "./materialize-grok-mcp"
import { createMcpPackageFixture, runMcpProbe } from "../test/materialize-grok-mcp.test-helpers"

describe("ast-grep MCP runtime", () => {
  let pluginRoot = ""
  let sourceRoot = ""
  let searchRoot = ""

  afterEach(async () => {
    if (pluginRoot.length > 0) await rm(pluginRoot, { recursive: true, force: true })
    if (sourceRoot.length > 0) await rm(sourceRoot, { recursive: true, force: true })
    if (searchRoot.length > 0) await rm(searchRoot, { recursive: true, force: true })
  })

  test("rejects empty tools/list for ast_grep upgrade target", async () => {
    sourceRoot = await createMcpPackageFixture(["ast-grep-mcp"])
    pluginRoot = await mkdtemp(join(tmpdir(), "lfg-mcp-tools-contract-"))

    const result = await materializeGrokMcpRuntimes(pluginRoot, join(sourceRoot, "omo-codex", "plugin"), "darwin", {
      codegraphEntry: null,
    })

    expect(result.ok).toBe(true)
    const responses = await runMcpProbe(join(pluginRoot, "mcp-runtimes", "ast-grep-mcp", "dist", "cli.js"))
    expect(responses.stderr).toBe("")
    expect(responses.messages).toContainEqual(
      expect.objectContaining({
        id: 2,
        result: expect.objectContaining({
          tools: expect.arrayContaining([
            expect.objectContaining({
              name: expect.any(String),
            }),
          ]),
        }),
      }),
    )
  })

  test("runs ast_grep structural search and reports malformed patterns as typed MCP errors", async () => {
    sourceRoot = await createMcpPackageFixture(["ast-grep-mcp"])
    pluginRoot = await mkdtemp(join(tmpdir(), "lfg-mcp-ast-grep-runtime-"))
    searchRoot = await mkdtemp(join(tmpdir(), "lfg-mcp-ast-grep-fixture-"))
    const sample = join(searchRoot, "sample.ts")
    await writeFile(sample, "function demo() {\n  console.log(\"hello\")\n  logger.info(\"skip\")\n}\n", "utf8")

    const result = await materializeGrokMcpRuntimes(pluginRoot, join(sourceRoot, "omo-codex", "plugin"), "darwin", {
      codegraphEntry: null,
    })

    expect(result.ok).toBe(true)
    const cli = join(pluginRoot, "mcp-runtimes", "ast-grep-mcp", "dist", "cli.js")
    const probe = spawnSync(
      process.execPath,
      [cli, "mcp"],
      {
        encoding: "utf8",
        input: [
          JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
          JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
          JSON.stringify({
            jsonrpc: "2.0",
            id: 3,
            method: "tools/call",
            params: { name: "ast_grep_search", arguments: { path: sample, pattern: "console.log($MSG)", language: "ts" } },
          }),
          JSON.stringify({
            jsonrpc: "2.0",
            id: 4,
            method: "tools/call",
            params: { name: "ast_grep_search", arguments: { path: sample, pattern: "console.log(", language: "ts" } },
          }),
          "",
        ].join("\n"),
        env: { ...process.env, LFG_AST_GREP_BIN: "", PATH: "" },
        timeout: 5000,
      },
    )

    expect(probe.status, probe.stderr).toBe(0)
    expect(probe.stderr).toBe("")
    const messages = probe.stdout.trim().split(/\n+/).map((line) => JSON.parse(line) as unknown)
    expect(messages).toContainEqual(
      expect.objectContaining({
        id: 2,
        result: expect.objectContaining({
          tools: expect.arrayContaining([expect.objectContaining({ name: "ast_grep_search" })]),
        }),
      }),
    )
    expect(messages).toContainEqual(
      expect.objectContaining({
        id: 3,
        result: expect.objectContaining({
          structuredContent: expect.objectContaining({
            engine: "fallback-js-call-expression",
            matches: expect.arrayContaining([
              expect.objectContaining({
                file: sample,
                text: "console.log(\"hello\")",
              }),
            ]),
          }),
        }),
      }),
    )
    expect(messages).toContainEqual(
      expect.objectContaining({
        id: 4,
        error: expect.objectContaining({
          code: -32602,
          data: expect.objectContaining({ kind: "malformed_pattern" }),
        }),
      }),
    )
  })

  test("returns typed MCP invalid_path error before ast_grep engine selection", async () => {
    sourceRoot = await createMcpPackageFixture(["ast-grep-mcp"])
    pluginRoot = await mkdtemp(join(tmpdir(), "lfg-mcp-ast-grep-invalid-path-"))

    const result = await materializeGrokMcpRuntimes(pluginRoot, join(sourceRoot, "omo-codex", "plugin"), "darwin", {
      codegraphEntry: null,
    })

    expect(result.ok).toBe(true)
    const cli = join(pluginRoot, "mcp-runtimes", "ast-grep-mcp", "dist", "cli.js")
    const missingPath = join(tmpdir(), "lfg-mcp-ast-grep-definitely-missing-path")
    const input = [
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "ast_grep_search", arguments: { path: missingPath, pattern: "console.log($MSG)", language: "ts" } },
      }),
      "",
    ].join("\n")
    const normalPathProbe = spawnSync(
      process.execPath,
      [cli, "mcp"],
      {
        encoding: "utf8",
        input,
        env: { ...process.env, LFG_AST_GREP_BIN: "" },
        timeout: 5000,
      },
    )
    const fallbackProbe = spawnSync(
      process.execPath,
      [cli, "mcp"],
      {
        encoding: "utf8",
        input,
        env: { ...process.env, LFG_AST_GREP_BIN: "", PATH: "" },
        timeout: 5000,
      },
    )

    for (const probe of [normalPathProbe, fallbackProbe]) {
      expect(probe.status, probe.stderr).toBe(0)
      expect(probe.stderr).toBe("")
      const messages = probe.stdout.trim().split(/\n+/).map((line) => JSON.parse(line) as unknown)
      expect(messages).toContainEqual(
        expect.objectContaining({
          id: 1,
          error: expect.objectContaining({
            code: -32602,
            data: expect.objectContaining({ kind: "invalid_path" }),
          }),
        }),
      )
    }
  })

  test("rejects arbitrary executable override via LFG_AST_GREP_BIN (basename allowlist only)", async () => {
    sourceRoot = await createMcpPackageFixture(["ast-grep-mcp"])
    pluginRoot = await mkdtemp(join(tmpdir(), "lfg-mcp-ast-grep-lfg-override-"))
    searchRoot = await mkdtemp(join(tmpdir(), "lfg-mcp-ast-grep-lfg-fixture-"))
    const sample = join(searchRoot, "sample.ts")
    await writeFile(sample, "console.log(\"hi\")\n", "utf8")
    const evil = join(searchRoot, "evil-bin")
    await writeFile(evil, "#!/bin/sh\necho EVIL-RAN-MARKER\nexit 0\n", "utf8")
    const { chmod } = await import("node:fs/promises")
    await chmod(evil, 0o755)
    const result = await materializeGrokMcpRuntimes(pluginRoot, join(sourceRoot, "omo-codex", "plugin"), "darwin", { codegraphEntry: null })
    expect(result.ok).toBe(true)
    const cli = join(pluginRoot, "mcp-runtimes", "ast-grep-mcp", "dist", "cli.js")
    const input = [
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
      JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
      JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "ast_grep_search", arguments: { path: sample, pattern: "console.log($MSG)", language: "ts" } } }),
      "",
    ].join("\n")
    const probe = spawnSync(process.execPath, [cli, "mcp"], { encoding: "utf8", input, env: { ...process.env, LFG_AST_GREP_BIN: evil, PATH: "" }, timeout: 8000 })
    expect(probe.status).toBe(0)
    const markerPath = join(searchRoot, "evil.marker")
    let evilRan = false
    try { await import("node:fs/promises").then(m => m.access(markerPath)); evilRan = true } catch {}
    expect(evilRan).toBe(false)
    const msgs = probe.stdout.trim().split(/\n+/).filter(Boolean).map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
    const sawEvil = msgs.some(m => m.result && JSON.stringify(m.result).match(/EVIL-RAN/))
    expect(sawEvil).toBe(false)
  })

  test("bounds sg child stdout/stderr to 1MiB and emits typed output_too_large MCP error", async () => {
    sourceRoot = await createMcpPackageFixture(["ast-grep-mcp"])
    pluginRoot = await mkdtemp(join(tmpdir(), "lfg-mcp-ast-grep-bound-"))
    searchRoot = await mkdtemp(join(tmpdir(), "lfg-mcp-ast-grep-bound-fixture-"))
    const sample = join(searchRoot, "sample.ts")
    await writeFile(sample, "console.log(1)\n", "utf8")
    const largeSg = join(searchRoot, "sg")
    await writeFile(largeSg, "#!/bin/sh\n/usr/bin/head -c 2097152 /dev/zero\n", "utf8")
    const { chmod } = await import("node:fs/promises")
    await chmod(largeSg, 0o755)
    const result = await materializeGrokMcpRuntimes(pluginRoot, join(sourceRoot, "omo-codex", "plugin"), "darwin", { codegraphEntry: null })
    expect(result.ok).toBe(true)
    const cli = join(pluginRoot, "mcp-runtimes", "ast-grep-mcp", "dist", "cli.js")
    const input = [
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
      JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
      JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "ast_grep_search", arguments: { path: sample, pattern: "console.log($MSG)", language: "ts" } } }),
      "",
    ].join("\n")
    const probe = spawnSync(process.execPath, [cli, "mcp"], { encoding: "utf8", input, env: { ...process.env, PATH: searchRoot }, timeout: 10000 })
    expect(probe.status).toBe(0)
    const msgs = probe.stdout.trim().split(/\n+/).filter(Boolean).map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
    const tooLargeMsg = msgs.find(m => m && m.error && m.error.data && m.error.data.kind === "output_too_large")
    expect(tooLargeMsg, "must contain error.data.kind === output_too_large; fails on search_failed/success/omit").toBeDefined()
    expect(tooLargeMsg.error.data.kind).toBe("output_too_large")
    expect(probe.stdout.length < 2*1024*1024 + 20000).toBe(true)
  })

  test("LFG_AST_GREP_BIN support removed: arbitrary path is never used (env ignored)", async () => {
    sourceRoot = await createMcpPackageFixture(["ast-grep-mcp"])
    pluginRoot = await mkdtemp(join(tmpdir(), "lfg-mcp-ast-grep-lfg-removed-"))
    searchRoot = await mkdtemp(join(tmpdir(), "lfg-mcp-ast-grep-lfg-removed-fixture-"))
    const sample = join(searchRoot, "sample.ts")
    await writeFile(sample, "console.log(1)\n", "utf8")
    const evil = join(searchRoot, "evil")
    await writeFile(evil, "#!/bin/sh\necho 'EVIL-LFG-RAN'\nexit 0\n", "utf8")
    const { chmod } = await import("node:fs/promises")
    await chmod(evil, 0o755)
    const result = await materializeGrokMcpRuntimes(pluginRoot, join(sourceRoot, "omo-codex", "plugin"), "darwin", { codegraphEntry: null })
    expect(result.ok).toBe(true)
    const cli = join(pluginRoot, "mcp-runtimes", "ast-grep-mcp", "dist", "cli.js")
    const input = [
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
      JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
      JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "ast_grep_search", arguments: { path: sample, pattern: "console.log($MSG)" } } }),
      "",
    ].join("\n")
    const probe = spawnSync(process.execPath, [cli, "mcp"], { encoding: "utf8", input, env: { ...process.env, LFG_AST_GREP_BIN: evil, PATH: "" }, timeout: 8000 })
    expect(probe.status).toBe(0)
    const combined = (probe.stdout || "") + (probe.stderr || "")
    expect(combined.includes("EVIL-LFG-RAN")).toBe(false)
    const msgs = probe.stdout.trim().split(/\n+/).filter(Boolean).map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
    const sawEvil = msgs.some(m => m.result && JSON.stringify(m.result).match(/EVIL/))
    expect(sawEvil).toBe(false)
  })

  test("runCommand bounds stdout/stderr bytes before append; kills child and surfaces output_too_large", async () => {
    sourceRoot = await createMcpPackageFixture(["ast-grep-mcp"])
    pluginRoot = await mkdtemp(join(tmpdir(), "lfg-mcp-ast-grep-bytecap-"))
    searchRoot = await mkdtemp(join(tmpdir(), "lfg-mcp-ast-grep-bytecap-fixture-"))
    const sample = join(searchRoot, "s.ts")
    await writeFile(sample, "x\n", "utf8")
    const flood = join(searchRoot, "sg")
    await writeFile(flood, "#!/bin/sh\n/usr/bin/head -c 3145728 /dev/zero\n", "utf8")
    const { chmod } = await import("node:fs/promises")
    await chmod(flood, 0o755)
    const result = await materializeGrokMcpRuntimes(pluginRoot, join(sourceRoot, "omo-codex", "plugin"), "darwin", { codegraphEntry: null })
    expect(result.ok).toBe(true)
    const cli = join(pluginRoot, "mcp-runtimes", "ast-grep-mcp", "dist", "cli.js")
    const input = [
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
      JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
      JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "ast_grep_search", arguments: { path: sample, pattern: "x" } } }),
      "",
    ].join("\n")
    const probe = spawnSync(process.execPath, [cli, "mcp"], { encoding: "utf8", input, env: { ...process.env, PATH: searchRoot }, timeout: 15000 })
    expect(probe.status).toBe(0)
    const msgs = probe.stdout.trim().split(/\n+/).filter(Boolean).map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
    const sawTooLargeMsg = msgs.find(m => m && m.error && m.error.data && m.error.data.kind === "output_too_large")
    expect(sawTooLargeMsg, "must contain error.data.kind === output_too_large; fails on search_failed/success/omit").toBeDefined()
    expect(sawTooLargeMsg.error.data.kind).toBe("output_too_large")
    expect(probe.stdout.length).toBeLessThan(1100000)
  })
})
