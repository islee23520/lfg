import { spawn, spawnSync } from "node:child_process"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { createServer, type IncomingMessage } from "node:http"
import type { ChildProcessWithoutNullStreams } from "node:child_process"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, test } from "vitest"
import { runMcpProbe } from "../test/materialize-grok-mcp.test-helpers"

const XAI_OAUTH_TOKEN_URL = "https://auth.x.ai/oauth2/token"

describe("bundled MCP runtimes", () => {
  let homeRoot = ""

  afterEach(async () => {
    if (homeRoot.length > 0) await rm(homeRoot, { recursive: true, force: true })
  })

  test("documents bundled local MCP runtimes with ast_grep behavior and clean ESM startup", async () => {
    const astGrepCli = join(process.cwd(), "dist", "grok-install", "mcp-runtimes", "ast-grep-mcp", "dist", "cli.js")
    const astGrepResponses = await runMcpProbe(astGrepCli)
    expect(astGrepResponses.stderr).toBe("")
    expect(astGrepResponses.messages).toContainEqual(
      expect.objectContaining({
        id: 1,
        result: expect.objectContaining({
          capabilities: { tools: {} },
          serverInfo: { name: "lfg-ast_grep", version: "0.1.0" },
        }),
      }),
    )
    expect(astGrepResponses.messages).toContainEqual(
      expect.objectContaining({
        id: 2,
        result: expect.objectContaining({
          tools: expect.arrayContaining([expect.objectContaining({ name: "ast_grep_search" })]),
        }),
      }),
    )

    const gitBashCli = join(process.cwd(), "dist", "grok-install", "mcp-runtimes", "git-bash-mcp", "dist", "cli.js")
    const gitBashResponses = await runMcpProbe(gitBashCli)
    expect(gitBashResponses.stderr).toBe("")
    expect(gitBashResponses.messages).toContainEqual(
      expect.objectContaining({
        id: 1,
        result: expect.objectContaining({
          capabilities: { tools: {} },
          serverInfo: { name: "lfg-git_bash", version: "0.0.0" },
        }),
      }),
    )
    expect(gitBashResponses.messages).toContainEqual({ jsonrpc: "2.0", id: 2, result: { tools: [] } })

    const lspResponses = await runMcpProbe(join(process.cwd(), "dist", "grok-install", "mcp-runtimes", "lsp-daemon", "dist", "cli.js"))
    expect(lspResponses.stderr).toBe("")
    expect(lspResponses.messages).toContainEqual(
      expect.objectContaining({
        id: 1,
        result: expect.objectContaining({
          capabilities: { tools: {} },
          serverInfo: { name: "lfg-lsp", version: "0.1.0" },
        }),
      }),
    )
    expect(lspResponses.messages).toContainEqual(
      expect.objectContaining({
        id: 2,
        result: expect.objectContaining({
          tools: expect.arrayContaining([expect.objectContaining({ name: "typescript_diagnostics" })]),
        }),
      }),
    )
  })

  test("starts bundled xAI Grok MCP runtime with six tools and safe auth-missing errors", async () => {
    const cli = join(process.cwd(), "dist", "grok-install", "mcp-runtimes", "xai-grok-mcp", "dist", "cli.js")
    homeRoot = await mkdtemp(join(tmpdir(), "lfg-xai-mcp-home-"))
    const probe = spawnSync(
      process.execPath,
      [cli, "mcp"],
      {
        encoding: "utf8",
        input: [
          JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
          JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
          JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "xai_generate_text", arguments: { prompt: "hello" } } }),
          "",
        ].join("\n"),
        env: { PATH: process.env.PATH ?? "", HOME: homeRoot },
      },
    )
    expect(probe.status, probe.stderr).toBe(0)
    const messages = probe.stdout.trim().split(/\n+/).map((line) => JSON.parse(line) as { id: number; result?: { tools?: readonly { name: string }[] }; error?: { message: string } })
    expect(messages.find((message) => message.id === 2)?.result?.tools?.map((tool) => tool.name).sort()).toEqual([
      "xai_auth_logout",
      "xai_auth_refresh",
      "xai_auth_set_api_key",
      "xai_auth_set_oauth",
      "xai_auth_status",
      "xai_generate_text",
      "xai_image_generate",
      "xai_tts",
      "xai_video_generate",
      "xai_web_search",
      "xai_x_search",
    ])
    expect(messages.find((message) => message.id === 3)?.error?.message).toContain("xAI credentials not found")
    expect(messages.find((message) => message.id === 3)?.error?.message).not.toContain("Bearer")
  })

  test("uses dedicated xAI OAuth token for MCP tool calls", async () => {
    const cli = join(process.cwd(), "dist", "grok-install", "mcp-runtimes", "xai-grok-mcp", "dist", "cli.js")
    homeRoot = await mkdtemp(join(tmpdir(), "lfg-xai-mcp-oauth-home-"))
    await mkdir(join(homeRoot, ".grok"), { recursive: true })
    await writeFile(
      join(homeRoot, ".grok", "xai-grok-mcp-auth.json"),
      JSON.stringify(
        {
          provider: "xai-oauth",
          auth_mode: "oauth",
          access: "oauth-access-runtime",
          refresh: "oauth-refresh-runtime",
          expires: Date.now() + 3600_000,
          tokenEndpoint: XAI_OAUTH_TOKEN_URL,
          tokenType: "Bearer",
        },
        null,
        2,
      ),
      "utf8",
    )

    let authorizationHeader = ""
    const server = createServer((request, response) => {
      authorizationHeader = firstHeader(request, "authorization")
      response.writeHead(200, { "content-type": "application/json" })
      response.end(JSON.stringify({ output_text: "oauth ok" }))
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    try {
      const address = server.address()
      if (typeof address !== "object" || address === null) throw new Error("test server did not bind")
      const probe = await runRuntimeProbe(
        process.execPath,
        [cli, "mcp"],
        [
          JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
          JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "xai_generate_text", arguments: { prompt: "hello" } } }),
          "",
        ].join("\n"),
        { PATH: process.env.PATH ?? "", HOME: homeRoot, XAI_BASE_URL: `http://127.0.0.1:${address.port}` },
      )
      expect(probe.exitCode, probe.stderr).toBe(0)
      const messages = probe.stdout.trim().split(/\n+/).map((line) => JSON.parse(line) as { id: number; result?: { content?: readonly { text: string }[] }; error?: { message: string } })
      expect(messages.find((message) => message.id === 2)?.error).toBeUndefined()
      expect(messages.find((message) => message.id === 2)?.result?.content?.[0]?.text).toContain("oauth ok")
      expect(authorizationHeader).toBe("Bearer oauth-access-runtime")
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error === undefined ? resolve() : reject(error))))
    }
  })

  test("manages xAI OAuth credentials through MCP auth tools", async () => {
    const cli = join(process.cwd(), "dist", "grok-install", "mcp-runtimes", "xai-grok-mcp", "dist", "cli.js")
    homeRoot = await mkdtemp(join(tmpdir(), "lfg-xai-mcp-native-oauth-home-"))

    let authorizationHeader = ""
    const server = createServer((request, response) => {
      authorizationHeader = firstHeader(request, "authorization")
      response.writeHead(200, { "content-type": "application/json" })
      response.end(JSON.stringify({ output_text: "native oauth ok" }))
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    try {
      const address = server.address()
      if (typeof address !== "object" || address === null) throw new Error("test server did not bind")
      const probe = await runRuntimeProbe(
        process.execPath,
        [cli, "mcp"],
        [
          JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
          JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
          JSON.stringify({
            jsonrpc: "2.0",
            id: 3,
            method: "tools/call",
            params: {
              name: "xai_auth_set_oauth",
              arguments: {
                access_token: "native-oauth-access",
                refresh_token: "native-oauth-refresh",
                expires_in: 3600,
                token_endpoint: XAI_OAUTH_TOKEN_URL,
              },
            },
          }),
          JSON.stringify({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "xai_auth_status", arguments: {} } }),
          JSON.stringify({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "xai_generate_text", arguments: { prompt: "hello" } } }),
          JSON.stringify({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "xai_auth_logout", arguments: {} } }),
          "",
        ].join("\n"),
        { PATH: process.env.PATH ?? "", HOME: homeRoot, XAI_BASE_URL: `http://127.0.0.1:${address.port}` },
      )
      expect(probe.exitCode, probe.stderr).toBe(0)
      expect(probe.stdout).not.toContain("native-oauth-access")
      expect(probe.stdout).not.toContain("native-oauth-refresh")
      const messages = probe.stdout.trim().split(/\n+/).map((line) => JSON.parse(line) as { id: number; result?: { tools?: readonly { name: string }[]; content?: readonly { text: string }[] }; error?: { message: string } })
      expect(messages.find((message) => message.id === 2)?.result?.tools?.map((tool) => tool.name)).toEqual(expect.arrayContaining(["xai_auth_status", "xai_auth_set_oauth", "xai_auth_refresh", "xai_auth_logout"]))
      expect(messages.find((message) => message.id === 3)?.result?.content?.[0]?.text).toContain('"status": "xai_oauth_saved"')
      expect(messages.find((message) => message.id === 4)?.result?.content?.[0]?.text).toContain('"mode": "oauth"')
      expect(messages.find((message) => message.id === 5)?.result?.content?.[0]?.text).toContain("native oauth ok")
      expect(messages.find((message) => message.id === 6)?.result?.content?.[0]?.text).toContain('"removed": true')
      expect(authorizationHeader).toBe("Bearer native-oauth-access")
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error === undefined ? resolve() : reject(error))))
    }
  })

  test("rejects custom xAI OAuth token endpoints through MCP auth tools", async () => {
    const cli = join(process.cwd(), "dist", "grok-install", "mcp-runtimes", "xai-grok-mcp", "dist", "cli.js")
    homeRoot = await mkdtemp(join(tmpdir(), "lfg-xai-mcp-endpoint-home-"))

    const probe = await runRuntimeProbe(
      process.execPath,
      [cli, "mcp"],
      [
        JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
        JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: {
            name: "xai_auth_set_oauth",
            arguments: {
              access_token: "native-oauth-access",
              refresh_token: "native-oauth-refresh",
              expires_in: 3600,
              token_endpoint: "https://auth.example.test/token",
            },
          },
        }),
        "",
      ].join("\n"),
      { PATH: process.env.PATH ?? "", HOME: homeRoot },
    )
    expect(probe.exitCode, probe.stderr).toBe(0)
    const messages = probe.stdout.trim().split(/\n+/).map((line) => JSON.parse(line) as { id: number; error?: { message: string } })
    expect(messages.find((message) => message.id === 2)?.error?.message).toBe(`OAuth token endpoint must be ${XAI_OAUTH_TOKEN_URL}`)
  })

  test("does not refresh Grok host OIDC fallback into dedicated xAI auth file", async () => {
    const cli = join(process.cwd(), "dist", "grok-install", "mcp-runtimes", "xai-grok-mcp", "dist", "cli.js")
    homeRoot = await mkdtemp(join(tmpdir(), "lfg-xai-mcp-host-oidc-home-"))
    await mkdir(join(homeRoot, ".grok"), { recursive: true })
    await writeFile(
      join(homeRoot, ".grok", "auth.json"),
      JSON.stringify({
        "https://auth.x.ai::grok-cli": {
          auth_mode: "oidc",
          oidc_issuer: "https://auth.x.ai",
          oidc_client_id: "grok-cli",
          key: "host-access-runtime",
          refresh_token: "host-refresh-runtime",
          expires_at: new Date(Date.now() + 30_000).toISOString(),
        },
      }),
      "utf8",
    )

    const probe = await runRuntimeProbe(
      process.execPath,
      [cli, "mcp"],
      [
        JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
        JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "xai_generate_text", arguments: { prompt: "hello" } } }),
        "",
      ].join("\n"),
      { PATH: process.env.PATH ?? "", HOME: homeRoot },
    )
    expect(probe.exitCode, probe.stderr).toBe(0)
    const messages = probe.stdout.trim().split(/\n+/).map((line) => JSON.parse(line) as { id: number; error?: { message: string } })
    expect(messages.find((message) => message.id === 2)?.error?.message).toContain("Grok host OIDC fallback is expired or near expiry")
    await expect(readFile(join(homeRoot, ".grok", "xai-grok-mcp-auth.json"), "utf8")).rejects.toMatchObject({ code: "ENOENT" })
  })

  test("package-shaped MCP hook shims exit 0 silently for deferred hook subcommands", () => {
    for (const component of ["ast-grep", "lsp"] as const) {
      const shim = join(process.cwd(), "dist", "grok-install", "components", component, "dist", "cli.js")
      const result = spawnSync(process.execPath, [shim, "hook"], { encoding: "utf8", timeout: 1000 })
      expect(result.error, result.stderr).toBeUndefined()
      expect(result.status).toBe(0)
      expect(result.stderr).toBe("")
    }
  })
})

async function runRuntimeProbe(
  command: string,
  args: readonly string[],
  input: string,
  env: Readonly<Record<string, string>>,
): Promise<{ readonly exitCode: number; readonly stdout: string; readonly stderr: string }> {
  const child = spawn(command, [...args], {
    env: { ...process.env, ...env },
    stdio: "pipe",
  })
  child.stdin.end(input)
  const [stdoutText, stderrText, exitCode] = await Promise.all([streamText(child.stdout), streamText(child.stderr), childExitCode(child)])
  return { exitCode, stdout: stdoutText, stderr: stderrText }
}

function streamText(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    stream.on("data", (chunk: Buffer) => chunks.push(chunk))
    stream.on("error", reject)
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")))
  })
}

function childExitCode(child: ChildProcessWithoutNullStreams): Promise<number> {
  return new Promise((resolve) => {
    child.on("close", (code) => resolve(code ?? 1))
  })
}

function firstHeader(request: IncomingMessage, name: string): string {
  const value = request.headers[name]
  if (Array.isArray(value)) return value[0] ?? ""
  return value ?? ""
}
