import { describe, expect, test } from "bun:test"
import { chmod, mkdtemp, readlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

const MCP = new URL("lfg-mcp.ts", import.meta.url).pathname
const HASH_PLUGIN_ID = "0-1-0-ff47fdd7"

describe("lfg MCP", () => {
  test("lists minimal tools and dispatches lazycodex install", async () => {
    const proc = Bun.spawn(["bun", MCP], { stdin: "pipe", stdout: "pipe", stderr: "pipe" })
    proc.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: "tools", method: "tools/list" })}\n`)
    proc.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: "install", method: "tools/call", params: { name: "lazycodex", arguments: { action: "install" } } })}\n`)
    proc.stdin.end()
    const stdout = await new Response(proc.stdout).text()
    const code = await proc.exited
    expect(code).toBe(0)
    const lines = stdout.trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>)
    expect(toolNames(lines[0])).toEqual(["status", "doctor", "config", "lazycodex", "setup"])
    expect(configToolSchema(lines[0])).toMatchObject({
      properties: {
        action: { enum: ["grok-byok"] },
        run: { type: "boolean" },
      },
    })
    expect(lazycodexToolSchema(lines[0])).toMatchObject({
      properties: {
        action: { enum: ["install", "status"] },
        run: { type: "boolean" },
      },
    })

    const install = toolTextData(lines[1])
    expect(install).toMatchObject({
      data: {
        ok: true,
        status: "planned",
        installerCommand: "npx lazycodex-ai install",
        lfgIsPlugin: false,
        grokSurfaces: {
          acpCommand: "grok agent stdio",
        },
        verificationCommands: expect.arrayContaining(["grok models", "grok inspect --json", "grok plugin list --json"]),
      },
    })
  })

  test("runs lazycodex install with stable lfg plugin link through MCP", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-home."))
    const fakeBin = await makeFakeNpx()
    const proc = Bun.spawn(["bun", MCP], { stdin: "pipe", stdout: "pipe", stderr: "pipe", env: { ...process.env, HOME: home, PATH: `${fakeBin}:${process.env.PATH ?? ""}` } })
    proc.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: "install-run", method: "tools/call", params: { name: "lazycodex", arguments: { action: "install", run: true } } })}\n`)
    proc.stdin.end()

    const stdout = await new Response(proc.stdout).text()
    const code = await proc.exited
    const lines = stdout.trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>)
    const install = toolTextData(lines[0])
    const target = join(home, ".grok", "installed-plugins", HASH_PLUGIN_ID)

    expect(code).toBe(0)
    expect(install).toMatchObject({
      data: {
        ok: true,
        status: "installed",
        stablePluginLink: {
          status: "linked",
          name: "lfg",
          targetPath: target,
        },
      },
    })
    expect(await readlink(join(home, ".grok", "installed-plugins", "lfg"))).toBe(target)
  })
})

function toolNames(response: Record<string, unknown> | undefined): string[] {
  const result = response?.result
  if (typeof result !== "object" || result === null || Array.isArray(result)) return []
  const tools = (result as Record<string, unknown>).tools
  if (!Array.isArray(tools)) return []
  return tools.flatMap((tool) => typeof tool === "object" && tool !== null && !Array.isArray(tool) && typeof tool.name === "string" ? [tool.name] : [])
}

function configToolSchema(response: Record<string, unknown> | undefined): Record<string, unknown> {
  const result = response?.result
  if (!isRecord(result) || !Array.isArray(result.tools)) return {}
  const tool = result.tools.find((candidate) => typeof candidate === "object" && candidate !== null && !Array.isArray(candidate) && (candidate as Record<string, unknown>).name === "config")
  return isRecord(tool) && isRecord(tool.inputSchema) ? tool.inputSchema : {}
}

function lazycodexToolSchema(response: Record<string, unknown> | undefined): Record<string, unknown> {
  const result = response?.result
  if (typeof result !== "object" || result === null || Array.isArray(result)) return {}
  const tools = (result as Record<string, unknown>).tools
  if (!Array.isArray(tools)) return {}
  const tool = tools.find((candidate) => typeof candidate === "object" && candidate !== null && !Array.isArray(candidate) && (candidate as Record<string, unknown>).name === "lazycodex")
  if (typeof tool !== "object" || tool === null || Array.isArray(tool)) return {}
  const schema = (tool as Record<string, unknown>).inputSchema
  return typeof schema === "object" && schema !== null && !Array.isArray(schema) ? (schema as Record<string, unknown>) : {}
}

function toolTextData(response: Record<string, unknown> | undefined): unknown {
  const result = response?.result
  if (typeof result !== "object" || result === null || Array.isArray(result)) return null
  const content = (result as Record<string, unknown>).content
  if (!Array.isArray(content)) return null
  const first = content[0]
  if (typeof first !== "object" || first === null || Array.isArray(first)) return null
  const text = (first as Record<string, unknown>).text
  return typeof text === "string" ? JSON.parse(text) : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

async function makeFakeNpx(): Promise<string> {
  const bin = await mkdtemp(join(tmpdir(), "lfg-fake-npx."))
  const targetScript = `target="$HOME/.grok/installed-plugins/${HASH_PLUGIN_ID}"`
  await writeFile(
    join(bin, "npx"),
    [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      targetScript,
      'mkdir -p "$target/.codex-plugin" "$target/skills"',
      `printf '%s\\n' '{"name":"lazycodex","version":"0.1.0"}' > "$target/.codex-plugin/plugin.json"`,
      `printf '%s\\n' '{"mcpServers":{}}' > "$target/.mcp.json"`,
      'echo fake lazycodex install: "$@"',
    ].join("\n"),
  )
  await chmod(join(bin, "npx"), 0o755)
  return bin
}
