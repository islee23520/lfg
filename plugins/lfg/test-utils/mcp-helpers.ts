export type JsonRpcRequest = { jsonrpc: "2.0"; id: number | string; method: string; params?: Record<string, unknown> }
export type JsonRpcResponse = { jsonrpc: "2.0"; id: number | string | null; result?: unknown; error?: { code: number; message: string; data?: unknown } }

export function jsonRpcRequest(id: number | string, method: string, params?: Record<string, unknown>): JsonRpcRequest {
  return params ? { jsonrpc: "2.0", id, method, params } : { jsonrpc: "2.0", id, method }
}

export function parseJsonRpcResponse(line: string): JsonRpcResponse {
  const parsed: unknown = JSON.parse(line)
  if (!isJsonRpcResponse(parsed)) throw new Error("invalid JSON-RPC response")
  return parsed
}

export async function runMcpStdio(command: string[], requests: JsonRpcRequest[], env: NodeJS.ProcessEnv = process.env): Promise<JsonRpcResponse[]> {
  const proc = Bun.spawn(command, { env, stdin: "pipe", stdout: "pipe", stderr: "pipe" })
  for (const request of requests) proc.stdin.write(`${JSON.stringify(request)}\n`)
  proc.stdin.end()
  const stdout = await new Response(proc.stdout).text()
  await proc.exited
  return stdout.split("\n").filter(Boolean).map(parseJsonRpcResponse)
}

function isJsonRpcResponse(value: unknown): value is JsonRpcResponse {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return record.jsonrpc === "2.0" && (typeof record.id === "string" || typeof record.id === "number" || record.id === null)
}
