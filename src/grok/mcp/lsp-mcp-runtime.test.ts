import { spawnSync } from "node:child_process"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, test } from "vitest"
import { materializeGrokMcpRuntimes, repairLspMcpRuntime } from "./materialize-grok-mcp"
import { createMcpPackageFixture, runMcpProbe } from "../test/materialize-grok-mcp.test-helpers"

type LspTool = {
  readonly name: string
}

type LspRpcMessage = {
  readonly id: number
  readonly result?: {
    readonly tools?: readonly LspTool[]
    readonly content?: readonly { readonly type: string; readonly text: string }[]
  }
}

type LspDiagnosticsPayload = {
  readonly kind: string
  readonly diagnostics: readonly {
    readonly file: string
    readonly code: string
    readonly severity: string
  }[]
}

describe("lsp MCP runtime", () => {
  let pluginRoot = ""
  let sourceRoot = ""

  afterEach(async () => {
    if (pluginRoot.length > 0) await rm(pluginRoot, { recursive: true, force: true })
    if (sourceRoot.length > 0) await rm(sourceRoot, { recursive: true, force: true })
  })

  test("returns TypeScript diagnostics and clears stale diagnostics after the file is fixed", async () => {
    sourceRoot = await createMcpPackageFixture(["lsp-daemon"])
    pluginRoot = await mkdtemp(join(tmpdir(), "lfg-mcp-lsp-runtime-"))
    const projectRoot = join(pluginRoot, "ts-project")
    await mkdir(join(projectRoot, "src"), { recursive: true })
    await writeFile(join(projectRoot, "tsconfig.json"), JSON.stringify({ compilerOptions: { strict: true, noEmit: true }, include: ["src/**/*.ts"] }), "utf8")
    await writeFile(join(projectRoot, "src", "index.ts"), "const value: number = 'wrong'\n", "utf8")

    const result = await materializeGrokMcpRuntimes(pluginRoot, join(sourceRoot, "omo-codex", "plugin"), "darwin", {
      codegraphEntry: null,
    })

    expect(result.ok).toBe(true)
    const cli = join(pluginRoot, "mcp-runtimes", "lsp-daemon", "dist", "cli.js")
    const dirty = runLspDiagnosticsProbe(cli, projectRoot)
    expect(dirty.stderr).toBe("")
    expect(dirty.messages.find((message) => message.id === 2)?.result?.tools?.map((tool) => tool.name)).toContain("typescript_diagnostics")
    expect(dirty.payload.kind).toBe("diagnostics")
    expect(dirty.payload.diagnostics).toEqual([
      expect.objectContaining({
        code: "TS2322",
        severity: "error",
      }),
    ])

    await writeFile(join(projectRoot, "src", "index.ts"), "const value: number = 1\n", "utf8")

    const clean = runLspDiagnosticsProbe(cli, projectRoot)
    expect(clean.stderr).toBe("")
    expect(clean.payload.kind).toBe("diagnostics")
    expect(clean.payload.diagnostics).toEqual([])
  })

  test("filters diagnostics by relative filePath from projectPath", async () => {
    sourceRoot = await createMcpPackageFixture(["lsp-daemon"])
    pluginRoot = await mkdtemp(join(tmpdir(), "lfg-mcp-lsp-relative-file-"))
    const projectRoot = join(pluginRoot, "ts-project")
    await mkdir(join(projectRoot, "src"), { recursive: true })
    await writeFile(join(projectRoot, "tsconfig.json"), JSON.stringify({ compilerOptions: { strict: true, noEmit: true }, include: ["src/**/*.ts"] }), "utf8")
    await writeFile(join(projectRoot, "src", "index.ts"), "const value: number = 'wrong'\n", "utf8")
    await writeFile(join(projectRoot, "src", "other.ts"), "const takesString = (value: string) => value\ntakesString(1)\n", "utf8")

    const result = await materializeGrokMcpRuntimes(pluginRoot, join(sourceRoot, "omo-codex", "plugin"), "darwin", {
      codegraphEntry: null,
    })

    expect(result.ok).toBe(true)
    const cli = join(pluginRoot, "mcp-runtimes", "lsp-daemon", "dist", "cli.js")
    const dirty = runLspDiagnosticsProbe(cli, projectRoot, "src/index.ts")

    expect(dirty.stderr).toBe("")
    expect(dirty.payload.kind).toBe("diagnostics")
    expect(dirty.payload.diagnostics).toEqual([
      expect.objectContaining({
        file: join(projectRoot, "src", "index.ts"),
        code: "TS2322",
        severity: "error",
      }),
    ])
  })

  test("replaces a discovered stale empty lsp-daemon runtime with the bundled diagnostics runtime", async () => {
    sourceRoot = await createMcpPackageFixture()
    pluginRoot = await mkdtemp(join(tmpdir(), "lfg-mcp-stale-lsp-discovered-"))
    const staleCli = join(sourceRoot, "lsp-daemon", "dist", "cli.js")
    await writeFile(
      staleCli,
      `#!/usr/bin/env node
import { createInterface } from "node:readline"
import { stdin, stdout } from "node:process"
const rl = createInterface({ input: stdin, crlfDelay: Infinity })
rl.on("line", (line) => {
  const request = JSON.parse(line)
  if (request.method === "initialize") stdout.write(JSON.stringify({ jsonrpc: "2.0", id: request.id, result: { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "stale-lsp", version: "0.0.0" } } }) + "\\n")
  if (request.method === "tools/list") stdout.write(JSON.stringify({ jsonrpc: "2.0", id: request.id, result: { tools: [] } }) + "\\n")
})
`,
      "utf8",
    )

    const result = await materializeGrokMcpRuntimes(pluginRoot, join(sourceRoot, "omo-codex", "plugin"), "darwin", {
      codegraphEntry: null,
    })

    expect(result.ok).toBe(true)
    const responses = await runMcpProbe(join(pluginRoot, "mcp-runtimes", "lsp-daemon", "dist", "cli.js"))
    expect(responses.stderr).toBe("")
    expect(responses.messages).toContainEqual(
      expect.objectContaining({
        id: 1,
        result: expect.objectContaining({
          serverInfo: { name: "lfg-lsp", version: "0.1.0" },
        }),
      }),
    )
    expect(responses.messages).toContainEqual(
      expect.objectContaining({
        id: 2,
        result: expect.objectContaining({
          tools: expect.arrayContaining([expect.objectContaining({ name: "typescript_diagnostics" })]),
        }),
      }),
    )
  })

  test("repairs an existing stale lsp-daemon runtime on preserve setup sync", async () => {
    sourceRoot = await mkdtemp(join(tmpdir(), "lfg-mcp-stale-lsp-repair-source-"))
    pluginRoot = await mkdtemp(join(tmpdir(), "lfg-mcp-stale-lsp-repair-"))
    const staleCli = join(pluginRoot, "mcp-runtimes", "lsp-daemon", "dist", "cli.js")
    await mkdir(join(pluginRoot, "mcp-runtimes", "lsp-daemon", "dist"), { recursive: true })
    await writeFile(staleCli, "#!/usr/bin/env node\n", "utf8")

    await repairLspMcpRuntime(pluginRoot, sourceRoot)

    const responses = await runMcpProbe(staleCli)
    expect(responses.stderr).toBe("")
    expect(responses.messages).toContainEqual(
      expect.objectContaining({
        id: 2,
        result: expect.objectContaining({
          tools: expect.arrayContaining([expect.objectContaining({ name: "typescript_diagnostics" })]),
        }),
      }),
    )
  })

  test("rejects empty tools/list for lsp upgrade target", async () => {
    sourceRoot = await createMcpPackageFixture(["lsp-daemon"])
    pluginRoot = await mkdtemp(join(tmpdir(), "lfg-mcp-tools-contract-"))

    const result = await materializeGrokMcpRuntimes(pluginRoot, join(sourceRoot, "omo-codex", "plugin"), "darwin", {
      codegraphEntry: null,
    })

    expect(result.ok).toBe(true)
    const responses = await runMcpProbe(join(pluginRoot, "mcp-runtimes", "lsp-daemon", "dist", "cli.js"))
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

  test("returns a typed JSON-RPC error when diagnostics input is malformed", async () => {
    sourceRoot = await createMcpPackageFixture(["lsp-daemon"])
    pluginRoot = await mkdtemp(join(tmpdir(), "lfg-mcp-lsp-malformed-"))
    const result = await materializeGrokMcpRuntimes(pluginRoot, join(sourceRoot, "omo-codex", "plugin"), "darwin", {
      codegraphEntry: null,
    })

    expect(result.ok).toBe(true)
    const cli = join(pluginRoot, "mcp-runtimes", "lsp-daemon", "dist", "cli.js")
    const malformed = spawnSync(
      process.execPath,
      [cli, "mcp"],
      {
        encoding: "utf8",
        input: [
          JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
          JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "typescript_diagnostics", arguments: {} } }),
          "",
        ].join("\n"),
        timeout: 5_000,
      },
    )

    expect(malformed.status, malformed.stderr).toBe(0)
    expect(malformed.stderr).toBe("")
    const messages = malformed.stdout.trim().split(/\n+/).map((line) => JSON.parse(line) as { readonly id: number; readonly error?: { readonly code: number; readonly message: string } })
    expect(messages).toContainEqual(
      expect.objectContaining({
        id: 2,
        error: {
          code: -32602,
          message: "projectPath is required",
        },
      }),
    )
  })
})

function runLspDiagnosticsProbe(cli: string, projectRoot: string, filePath?: string): {
  readonly stderr: string
  readonly messages: readonly LspRpcMessage[]
  readonly payload: LspDiagnosticsPayload
} {
  const probe = spawnSync(
    process.execPath,
    [cli, "mcp"],
    {
      encoding: "utf8",
      input: [
        JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
        JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
        JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "typescript_diagnostics", arguments: { projectPath: projectRoot, ...(filePath === undefined ? {} : { filePath }) } } }),
        "",
      ].join("\n"),
      env: {
        ...process.env,
        PATH: `${join(process.cwd(), "node_modules", ".bin")}:${process.env.PATH ?? ""}`,
      },
      timeout: 30_000,
    },
  )
  expect(probe.status, probe.stderr).toBe(0)
  const messages = probe.stdout.trim().split(/\n+/).map((line) => JSON.parse(line) as LspRpcMessage)
  const content = messages.find((message) => message.id === 3)?.result?.content?.[0]
  expect(content?.type).toBe("text")
  return {
    stderr: probe.stderr,
    messages,
    payload: JSON.parse(content?.text ?? "{}") as LspDiagnosticsPayload,
  }
}
