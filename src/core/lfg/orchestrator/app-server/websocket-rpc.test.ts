import { spawn } from "node:child_process"
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, test } from "vitest"
import { WebSocketRpcClient } from "./websocket-rpc"

const roots = new Set<string>()

afterEach(async () => {
  await Promise.all([...roots].map((root) => rm(root, { recursive: true, force: true })))
  roots.clear()
})

describe("WebSocketRpcClient", () => {
  test("rejects a request immediately after the client closes", async () => {
    const root = await mkdtemp(join(tmpdir(), "lfg-websocket-rpc-client-close-"))
    roots.add(root)
    const binary = join(root, "closing-proxy.mjs")
    await writeFile(binary, closingProxyScript(), "utf8")
    await chmod(binary, 0o755)
    const child = spawn(binary, [], { cwd: root })
    const client = new WebSocketRpcClient(child, 1_000)

    await expect(client.request(1, "initialize", {})).resolves.toEqual({})
    client.close()

    await expect(client.request(2, "thread/list", {})).rejects.toThrow("client closed")
  })

  test("rejects requests made after the proxy closes with the close cause", async () => {
    const root = await mkdtemp(join(tmpdir(), "lfg-websocket-rpc-close-"))
    roots.add(root)
    const binary = join(root, "closing-proxy.mjs")
    await writeFile(binary, closingProxyScript(), "utf8")
    await chmod(binary, 0o755)
    const child = spawn(binary, [], { cwd: root })
    const client = new WebSocketRpcClient(child, 1_000)

    await expect(client.request(1, "initialize", {})).resolves.toEqual({})
    await new Promise((resolve) => setTimeout(resolve, 100))
    await expect(client.request(2, "thread/list", {})).rejects.toThrow("closed the WebSocket")
  })
})

function closingProxyScript(): string {
  return `#!${process.execPath}
import { createHash } from "node:crypto"
let buffer = Buffer.alloc(0)
let upgraded = false
let replied = false
process.stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk])
  if (!upgraded) {
    const end = buffer.indexOf("\\r\\n\\r\\n")
    if (end < 0) return
    const request = buffer.subarray(0, end + 4).toString("utf8")
    const key = request.match(/Sec-WebSocket-Key: ([^\\r\\n]+)/i)?.[1]
    if (!key) process.exit(2)
    const accept = createHash("sha1").update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64")
    process.stdout.write("HTTP/1.1 101 Switching Protocols\\r\\nConnection: Upgrade\\r\\nUpgrade: websocket\\r\\nSec-WebSocket-Accept: " + accept + "\\r\\n\\r\\n")
    buffer = buffer.subarray(end + 4)
    upgraded = true
  }
  const frame = readFrame(buffer)
  if (!frame) return
  buffer = buffer.subarray(frame.bytes)
  if (replied) return
  replied = true
  const message = JSON.parse(frame.payload.toString("utf8"))
  send({ id: message.id, result: {} })
  setTimeout(() => process.stdout.write(Buffer.from([0x88, 0x00])), 5)
})
function readFrame(input) {
  if (input.length < 6) return null
  const length = input[1] & 0x7f
  const offset = length === 126 ? 4 : 2
  if (input.length < offset + 4 + length) return null
  const mask = input.subarray(offset, offset + 4)
  const payload = Buffer.from(input.subarray(offset + 4, offset + 4 + length))
  for (let index = 0; index < payload.length; index += 1) payload[index] ^= mask[index % 4]
  return { payload, bytes: offset + 4 + length }
}
function send(message) {
  const payload = Buffer.from(JSON.stringify(message))
  process.stdout.write(Buffer.concat([Buffer.from([0x81, payload.length]), payload]))
}
`
}
