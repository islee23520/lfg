export type JsonPrimitive = null | boolean | number | string
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }
export type JsonRecord = { [key: string]: JsonValue }

export type JsonRpcId = string | number | null

export type JsonRpcRequest = {
  jsonrpc?: string
  id?: JsonRpcId
  method?: string
  params?: unknown
}

export type JsonRpcError = {
  code: number
  message: string
  data?: JsonValue
}

export type JsonRpcResponse = {
  jsonrpc: "2.0"
  id: JsonRpcId
  result?: JsonValue
  error?: JsonRpcError
}

export type McpTool = {
  name: string
  description?: string
  inputSchema: JsonRecord
}

export const JSON_RPC_VERSION = "2.0"
export const MCP_PROTOCOL_VERSION = "2024-11-05"

export const JSON_RPC_ERRORS = {
  parseError: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internalError: -32603,
  serverError: -32000,
} as const

export function isJsonRecord(value: unknown): value is JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  return Object.values(value).every(isJsonValue)
}

export function isJsonValue(value: unknown): value is JsonValue {
  if (value === null) return true
  if (typeof value === "string" || typeof value === "boolean") return true
  if (typeof value === "number") return Number.isFinite(value)
  if (Array.isArray(value)) return value.every(isJsonValue)
  return isJsonRecord(value)
}

export function toJsonValue(value: unknown): JsonValue {
  return isJsonValue(value) ? value : String(value)
}

export function asJsonRecord(value: unknown): JsonRecord {
  return isJsonRecord(value) ? value : {}
}

export function jsonRpcResult(id: JsonRpcId, result: JsonValue = {}): JsonRpcResponse {
  return { jsonrpc: JSON_RPC_VERSION, id, result }
}

export function jsonRpcError(id: JsonRpcId, code: number, message: string, data?: JsonValue): JsonRpcResponse {
  return { jsonrpc: JSON_RPC_VERSION, id, error: data === undefined ? { code, message } : { code, message, data } }
}
