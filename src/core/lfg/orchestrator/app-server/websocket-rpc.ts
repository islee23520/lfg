import type { ChildProcessWithoutNullStreams } from "node:child_process"
import { createHash, randomBytes } from "node:crypto"

type PendingRequest = {
  readonly resolve: (value: unknown) => void
  readonly reject: (error: Error) => void
  readonly timer: NodeJS.Timeout
}

export class WebSocketRpcClient {
  readonly #child: ChildProcessWithoutNullStreams
  readonly #timeoutMs: number
  readonly #pending = new Map<number, PendingRequest>()
  #buffer = Buffer.alloc(0)
  #ready: Promise<void>
  #resolveReady: (() => void) | null = null
  #rejectReady: ((error: Error) => void) | null = null
  #terminalError: Error | null = null

  constructor(child: ChildProcessWithoutNullStreams, timeoutMs: number) {
    this.#child = child
    this.#timeoutMs = timeoutMs
    this.#ready = new Promise((resolve, reject) => {
      this.#resolveReady = resolve
      this.#rejectReady = reject
    })
    child.stdout.on("data", (chunk: Buffer) => this.#onData(chunk))
    child.on("error", (error) => this.#fail(error))
    child.on("close", (code) => this.#fail(new Error(`codex app-server proxy exited with code ${code ?? "unknown"}`)))
    this.#upgrade()
  }

  async request(id: number, method: string, params: Readonly<Record<string, unknown>>): Promise<unknown> {
    await this.#ready
    if (this.#terminalError) throw this.#terminalError
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id)
        reject(new Error(`${method} timed out after ${this.#timeoutMs}ms`))
      }, this.#timeoutMs)
      this.#pending.set(id, { resolve, reject, timer })
      this.#send({ id, method, params })
    })
  }

  async notify(method: string): Promise<void> {
    await this.#ready
    if (this.#terminalError) throw this.#terminalError
    this.#send({ method })
  }

  close(): void {
    this.#fail(new Error("codex app-server WebSocket client closed"))
    this.#child.kill()
  }

  #upgrade(): void {
    const key = randomBytes(16).toString("base64")
    const expected = createHash("sha1").update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64")
    const timer = setTimeout(() => this.#fail(new Error(`codex app-server proxy timed out after ${this.#timeoutMs}ms`)), this.#timeoutMs)
    const onHeaders = (chunk: Buffer): void => {
      this.#buffer = Buffer.concat([this.#buffer, chunk])
      const end = this.#buffer.indexOf("\r\n\r\n")
      if (end < 0) return
      this.#child.stdout.off("data", onHeaders)
      clearTimeout(timer)
      const headers = this.#buffer.subarray(0, end + 4).toString("utf8")
      this.#buffer = this.#buffer.subarray(end + 4)
      if (!headers.startsWith("HTTP/1.1 101") || !headers.toLowerCase().includes(`sec-websocket-accept: ${expected.toLowerCase()}`)) {
        this.#fail(new Error("codex app-server proxy rejected the WebSocket upgrade"))
        return
      }
      this.#child.stdout.on("data", (data: Buffer) => this.#onFrames(data))
      this.#resolveReady?.()
      this.#resolveReady = null
      this.#rejectReady = null
      this.#onFrames(Buffer.alloc(0))
    }
    this.#child.stdout.off("data", (chunk: Buffer) => this.#onData(chunk))
    this.#child.stdout.on("data", onHeaders)
    this.#child.stdin.write([
      "GET / HTTP/1.1", "Host: localhost", "Upgrade: websocket", "Connection: Upgrade",
      `Sec-WebSocket-Key: ${key}`, "Sec-WebSocket-Version: 13", "", "",
    ].join("\r\n"))
  }

  #onData(_chunk: Buffer): void {}

  #onFrames(chunk: Buffer): void {
    this.#buffer = Buffer.concat([this.#buffer, chunk])
    for (;;) {
      const frame = readFrame(this.#buffer)
      if (frame === null) return
      this.#buffer = this.#buffer.subarray(frame.bytes)
      if (frame.opcode === 0x9) {
        this.#child.stdin.write(encodeFrame(frame.payload, 0xA))
        continue
      }
      if (frame.opcode === 0x8) {
        this.#fail(new Error("codex app-server proxy closed the WebSocket"))
        return
      }
      if (frame.opcode !== 0x1) continue
      const message = parseRecord(frame.payload.toString("utf8"))
      if (typeof message?.id !== "number") continue
      const pending = this.#pending.get(message.id)
      if (!pending) continue
      this.#pending.delete(message.id)
      clearTimeout(pending.timer)
      message.error === undefined ? pending.resolve(message.result) : pending.reject(new Error(JSON.stringify(message.error)))
    }
  }

  #send(message: Readonly<Record<string, unknown>>): void {
    this.#child.stdin.write(encodeFrame(Buffer.from(JSON.stringify(message)), 0x1))
  }

  #fail(error: Error): void {
    this.#terminalError ??= error
    this.#rejectReady?.(error)
    this.#resolveReady = null
    this.#rejectReady = null
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(error)
    }
    this.#pending.clear()
  }
}

function encodeFrame(payload: Buffer, opcode: number): Buffer {
  const mask = randomBytes(4)
  const length = payload.length
  const header = length < 126
    ? Buffer.from([0x80 | opcode, 0x80 | length])
    : length <= 0xffff
      ? Buffer.from([0x80 | opcode, 0x80 | 126, length >> 8, length & 0xff])
      : encodeLongHeader(opcode, length)
  const masked = Buffer.alloc(length)
  for (let index = 0; index < length; index += 1) masked[index] = payload[index] ^ mask[index % 4]
  return Buffer.concat([header, mask, masked])
}

function encodeLongHeader(opcode: number, length: number): Buffer {
  const header = Buffer.alloc(10)
  header[0] = 0x80 | opcode
  header[1] = 0x80 | 127
  header.writeBigUInt64BE(BigInt(length), 2)
  return header
}

function readFrame(buffer: Buffer): { readonly opcode: number; readonly payload: Buffer; readonly bytes: number } | null {
  if (buffer.length < 2) return null
  const opcode = buffer[0] & 0x0f
  const code = buffer[1] & 0x7f
  const headerBytes = code < 126 ? 2 : code === 126 ? 4 : 10
  if (buffer.length < headerBytes) return null
  const length = code < 126 ? code : code === 126 ? buffer.readUInt16BE(2) : Number(buffer.readBigUInt64BE(2))
  if (!Number.isSafeInteger(length) || buffer.length < headerBytes + length) return null
  return { opcode, payload: buffer.subarray(headerBytes, headerBytes + length), bytes: headerBytes + length }
}

function parseRecord(value: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(value)
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null
  } catch {
    return null
  }
}
