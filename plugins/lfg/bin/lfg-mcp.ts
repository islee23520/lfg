#!/usr/bin/env bun
import { createInterface } from "node:readline"
import { join, resolve } from "node:path"

type JsonPrimitive = null | boolean | number | string
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }
type JsonRecord = { [key: string]: JsonValue }
type JsonRpcId = string | number | null
type JsonRpcResponse = { readonly jsonrpc: "2.0"; readonly id: JsonRpcId; readonly result?: JsonValue; readonly error?: { readonly code: number; readonly message: string; readonly data?: JsonValue } }
type JsonRpcRequest = { readonly id?: JsonRpcId; readonly method?: string; readonly params?: unknown }
type McpTool = { readonly name: string; readonly description: string; readonly inputSchema: JsonRecord }

const PLUGIN_ROOT = resolve(import.meta.dir, "..")
const TOOLS: readonly McpTool[] = [
  { name: "status", description: "Show the local lfg lazycodex adapter installer status.", inputSchema: emptySchema() },
  { name: "doctor", description: "Check the minimal lfg lazycodex adapter installer.", inputSchema: emptySchema() },
  { name: "config", description: "Return or run the explicit Grok BYOK config helper.", inputSchema: actionSchema(["grok-byok"], true) },
  { name: "lazycodex", description: "Return the lazycodex-ai install plan/status or explicitly run the installer.", inputSchema: actionSchema(["install", "status"], true) },
  { name: "setup", description: "Return the non-mutating lazycodex-ai setup install plan.", inputSchema: actionSchema(["install-plan", "show"]) },
]

await runStdioServer()

async function runStdioServer(): Promise<void> {
  const reader = createInterface({ input: process.stdin, crlfDelay: Infinity })
  for await (const line of reader) {
    const trimmed = line.trim()
    if (!trimmed) continue
    writeResponse(await handleLine(trimmed))
  }
}

async function handleLine(line: string): Promise<JsonRpcResponse> {
  try {
    return await handleMessage(JSON.parse(line) as unknown)
  } catch (error) {
    if (error instanceof SyntaxError) return jsonRpcError(null, -32700, "Parse error")
    return jsonRpcError(null, -32603, error instanceof Error ? error.message : String(error))
  }
}

async function handleMessage(message: unknown): Promise<JsonRpcResponse> {
  const request = normalizeRequest(message)
  if (!request) return jsonRpcError(null, -32600, "Invalid Request")
  const id = request.id ?? null
  if (!request.method) return jsonRpcError(id, -32600, "Invalid Request")
  if (request.method === "initialize") return jsonRpcResult(id, { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "lfg-harness", version: await pluginVersion() } })
  if (request.method === "notifications/initialized") return jsonRpcResult(id, {})
  if (request.method === "tools/list") return jsonRpcResult(id, { tools: [...TOOLS] })
  if (request.method === "tools/call") return jsonRpcResult(id, await callTool(asJsonRecord(request.params)))
  if (request.method === "ping") return jsonRpcResult(id, {})
  return jsonRpcError(id, -32601, `Method not found: ${request.method}`)
}

async function callTool(params: JsonRecord): Promise<JsonRecord> {
  const name = typeof params.name === "string" ? params.name : ""
  const args = asJsonRecord(params.arguments)
  if (name === "status") return textResult(await runLfgJson(["status"]))
  if (name === "doctor") return textResult(await runLfgJson(["doctor"]))
  if (name === "config") {
    const action = typeof args.action === "string" ? args.action : "grok-byok"
    if (action === "grok-byok") return textResult(await runLfgJson(args.run === true ? ["config", "grok-byok", "--run"] : ["config", "grok-byok"]))
  }
  if (name === "lazycodex") {
    const action = typeof args.action === "string" ? args.action : "status"
    if (action === "install") return textResult(await runLfgJson(args.run === true ? ["lazycodex", "install", "--run"] : ["lazycodex", "install"]))
    if (action === "status") return textResult(await runLfgJson(["lazycodex", "status"]))
  }
  if (name === "setup") {
    const action = typeof args.action === "string" ? args.action : "install-plan"
    if (action === "install-plan") return textResult(await runLfgJson(["setup", "install-plan"]))
    if (action === "show") return textResult(await runLfgJson(["setup", "show"]))
  }
  throw new Error(name)
}

async function runLfgJson(args: readonly string[]): Promise<JsonRecord> {
  const cmd = [join(PLUGIN_ROOT, "bin", "lfg"), "--json", ...args]
  const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe", env: process.env })
  const [returncode, stdout, stderr] = await Promise.all([proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text()])
  const stdoutText = stdout.trim()
  let data: JsonValue = null
  let parseError: string | null = null
  if (stdoutText) {
    try {
      data = toJsonValue(JSON.parse(stdoutText))
    } catch (error) {
      parseError = error instanceof Error ? error.message : String(error)
    }
  }
  const ok = returncode === 0 && parseError === null
  return { ok, status: ok ? "ok" : "error", cmd, returncode, data, stdout, stderr, stdoutJson: parseError === null, parseError }
}

async function pluginVersion(): Promise<string> {
  try {
    const parsed: unknown = JSON.parse(await Bun.file(join(PLUGIN_ROOT, "package.json")).text())
    if (isRecord(parsed) && typeof parsed.version === "string") return parsed.version
  } catch {}
  return "0.0.0"
}

function normalizeRequest(message: unknown): JsonRpcRequest | null {
  if (!isRecord(message)) return null
  const id = normalizeId(message.id)
  if (message.id !== undefined && id === undefined) return null
  return { id, method: typeof message.method === "string" ? message.method : undefined, params: message.params }
}

function normalizeId(value: unknown): JsonRpcId | undefined {
  if (value === undefined) return undefined
  if (value === null || typeof value === "string") return value
  if (typeof value === "number" && Number.isFinite(value)) return value
  return undefined
}

function textResult(value: unknown): JsonRecord {
  return { content: [{ type: "text", text: JSON.stringify(toJsonValue(value), null, 2) }] }
}

function jsonRpcResult(id: JsonRpcId, result: JsonValue = {}): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result }
}

function jsonRpcError(id: JsonRpcId, code: number, message: string, data?: JsonValue): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: data === undefined ? { code, message } : { code, message, data } }
}

function writeResponse(response: JsonRpcResponse): void {
  process.stdout.write(`${JSON.stringify(response)}\n`)
}

function emptySchema(): JsonRecord {
  return { type: "object", additionalProperties: false, properties: {} }
}

function actionSchema(actions: readonly string[], run = false): JsonRecord {
  const properties: JsonRecord = { action: { type: "string", enum: [...actions] } }
  if (run) properties.run = { type: "boolean" }
  return { type: "object", additionalProperties: false, properties }
}

function asJsonRecord(value: unknown): JsonRecord {
  return isJsonRecord(value) ? value : {}
}

function toJsonValue(value: unknown): JsonValue {
  return isJsonValue(value) ? value : String(value)
}

function isJsonRecord(value: unknown): value is JsonRecord {
  if (!isRecord(value)) return false
  return Object.values(value).every(isJsonValue)
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null) return true
  if (typeof value === "string" || typeof value === "boolean") return true
  if (typeof value === "number") return Number.isFinite(value)
  if (Array.isArray(value)) return value.every(isJsonValue)
  return isJsonRecord(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
