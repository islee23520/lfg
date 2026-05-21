import { createInterface } from "node:readline"
import { createToolDispatcher, type ToolDispatcher, type ToolDispatcherOptions } from "./tools"
import { asJsonRecord, JSON_RPC_ERRORS, jsonRpcError, jsonRpcResult, MCP_PROTOCOL_VERSION, type JsonRpcId, type JsonRpcRequest, type JsonRpcResponse } from "./protocol"

export type McpServerInfo = { name: string; version: string }

export type McpServerOptions = ToolDispatcherOptions & {
  dispatcher?: ToolDispatcher
  serverInfo?: McpServerInfo
}

export type McpServer = {
  handleMessage(message: unknown): Promise<JsonRpcResponse | null>
}

export async function createMcpServer(options: McpServerOptions = {}): Promise<McpServer> {
  const dispatcher = options.dispatcher ?? await createToolDispatcher(options)
  const serverInfo = options.serverInfo ?? await defaultServerInfo(options.root)
  return {
    async handleMessage(message) {
      const request = normalizeRequest(message)
      if (!request) return jsonRpcError(null, JSON_RPC_ERRORS.invalidRequest, "Invalid Request")
      const id = request.id ?? null
      const isNotification = request.id === undefined
      if (!request.method) return isNotification ? null : jsonRpcError(id, JSON_RPC_ERRORS.invalidRequest, "Invalid Request")
      if (request.method === "initialize") return isNotification ? null : jsonRpcResult(id, { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo })
      if (request.method === "notifications/initialized") return null
      if (request.method === "tools/list") return isNotification ? null : jsonRpcResult(id, { tools: dispatcher.tools })
      if (request.method === "tools/call") {
        if (isNotification) return null
        try {
          const params = asJsonRecord(request.params)
          const name = typeof params.name === "string" ? params.name : ""
          return jsonRpcResult(id, await dispatcher.callTool(name, params.arguments))
        } catch (error) {
          return jsonRpcError(id, JSON_RPC_ERRORS.serverError, error instanceof Error ? error.message : String(error))
        }
      }
      if (request.method === "ping") return isNotification ? null : jsonRpcResult(id, {})
      return isNotification ? null : jsonRpcError(id, JSON_RPC_ERRORS.methodNotFound, `Method not found: ${request.method}`)
    },
  }
}

export async function runStdioServer(options: McpServerOptions = {}): Promise<void> {
  const server = await createMcpServer(options)
  const reader = createInterface({ input: process.stdin, crlfDelay: Infinity })
  for await (const line of reader) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const response = await handleLine(server, trimmed)
    if (response) writeResponse(response)
  }
}

export async function handleLine(server: McpServer, line: string): Promise<JsonRpcResponse | null> {
  try {
    return await server.handleMessage(JSON.parse(line) as unknown)
  } catch (error) {
    if (error instanceof SyntaxError) return jsonRpcError(null, JSON_RPC_ERRORS.parseError, "Parse error")
    return jsonRpcError(null, JSON_RPC_ERRORS.internalError, error instanceof Error ? error.message : String(error))
  }
}

export function writeResponse(response: JsonRpcResponse): void {
  process.stdout.write(`${JSON.stringify(response)}\n`)
}

async function defaultServerInfo(root?: string): Promise<McpServerInfo> {
  const pluginRoot = root ?? process.env.GROK_PLUGIN_ROOT
  if (!pluginRoot) return { name: "lfg-harness", version: "0.0.0" }
  try {
    const pyproject = Bun.file(`${pluginRoot}/../../pyproject.toml`)
    const text = await pyproject.text()
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (trimmed.startsWith("version") && trimmed.includes("=")) return { name: "lfg-harness", version: trimmed.split("=", 2)[1]?.trim().replace(/^['\"]|['\"]$/g, "") ?? "0.0.0" }
    }
  } catch {
    return { name: "lfg-harness", version: "0.0.0" }
  }
  return { name: "lfg-harness", version: "0.0.0" }
}

function normalizeRequest(message: unknown): JsonRpcRequest | null {
  if (typeof message !== "object" || message === null || Array.isArray(message)) return null
  const record = message as Record<string, unknown>
  const id = normalizeId(record.id)
  if (record.id !== undefined && id === undefined) return null
  return { jsonrpc: typeof record.jsonrpc === "string" ? record.jsonrpc : undefined, id, method: typeof record.method === "string" ? record.method : undefined, params: record.params }
}

function normalizeId(value: unknown): JsonRpcId | undefined {
  if (value === undefined) return undefined
  if (value === null || typeof value === "string") return value
  if (typeof value === "number" && Number.isFinite(value)) return value
  return undefined
}
