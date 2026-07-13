import { randomUUID } from "node:crypto"
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { resolveClaudeHome } from "./paths"
import type { ClaudeCodeInventoryOptions } from "./types"

export type BridgeDirection = "lfg_to_claude" | "claude_to_lfg"
export type BridgeMessageStatus = "pending" | "read" | "replied"

export type BridgeMessage = {
  readonly id: string
  readonly direction: BridgeDirection
  readonly status: BridgeMessageStatus
  readonly createdAt: string
  readonly updatedAt: string
  readonly body: string
  readonly cwd: string | null
  readonly replyTo: string | null
  readonly source: string
}

export type BridgeStatus = {
  readonly ok: true
  readonly status: "claude_code_bridge"
  readonly bridgeRoot: string
  readonly pendingToClaude: number
  readonly pendingToLfg: number
  readonly total: number
  readonly claudeBinary: string | null
  readonly claudeBinaryAvailable: boolean
}

const BRIDGE_DIR = "lfg-bridge"
const MESSAGES_DIR = "messages"

export function resolveBridgeRoot(options: ClaudeCodeInventoryOptions = {}): string {
  return join(resolveClaudeHome(options), BRIDGE_DIR)
}

export function ensureBridgeLayout(options: ClaudeCodeInventoryOptions = {}): string {
  const root = resolveBridgeRoot(options)
  mkdirSync(join(root, MESSAGES_DIR), { recursive: true })
  const readme = join(root, "README.md")
  if (!existsSync(readme)) {
    writeFileSync(
      readme,
      [
        "# lfg ↔ Claude Code bridge",
        "",
        "Durable cross-agent mailbox written by `lfg claude message`.",
        "",
        "- Messages live in `messages/*.json`",
        "- direction `lfg_to_claude`: Grok/lfg → Claude Code",
        "- direction `claude_to_lfg`: Claude Code → Grok/lfg",
        "",
        "Claude: `lfg claude message list --box to-claude` or read pending files.",
        "Grok: `lfg claude message list --box to-lfg`",
        "",
        "Optional live ask (spawns Claude CLI): `lfg claude ask \"...\"`",
        "",
      ].join("\n"),
      "utf8",
    )
  }
  return root
}

export function sendBridgeMessage(
  body: string,
  options: {
    readonly direction?: BridgeDirection
    readonly cwd?: string | null
    readonly replyTo?: string | null
    readonly source?: string
  } & ClaudeCodeInventoryOptions = {},
): BridgeMessage {
  const text = body.trim()
  if (text.length === 0) {
    throw new Error("message body is empty")
  }
  const root = ensureBridgeLayout(options)
  const now = new Date().toISOString()
  const msg: BridgeMessage = {
    id: randomUUID(),
    direction: options.direction ?? "lfg_to_claude",
    status: "pending",
    createdAt: now,
    updatedAt: now,
    body: text,
    cwd: options.cwd ?? null,
    replyTo: options.replyTo ?? null,
    source: options.source ?? "lfg",
  }
  const path = messagePath(root, msg.id)
  atomicWriteJson(path, msg)
  return msg
}

export function listBridgeMessages(
  options: {
    readonly box?: "to-claude" | "to-lfg" | "all"
    readonly status?: BridgeMessageStatus | "any"
    readonly limit?: number
  } & ClaudeCodeInventoryOptions = {},
): readonly BridgeMessage[] {
  const root = ensureBridgeLayout(options)
  const dir = join(root, MESSAGES_DIR)
  let files: string[]
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".json"))
  } catch {
    return []
  }
  const box = options.box ?? "all"
  const statusFilter = options.status ?? "any"
  const msgs: BridgeMessage[] = []
  for (const file of files) {
    const raw = safeReadJson(join(dir, file))
    if (raw === null) continue
    if (box === "to-claude" && raw.direction !== "lfg_to_claude") continue
    if (box === "to-lfg" && raw.direction !== "claude_to_lfg") continue
    if (statusFilter !== "any" && raw.status !== statusFilter) continue
    msgs.push(raw)
  }
  msgs.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const limit = options.limit ?? 50
  return msgs.slice(0, Math.max(1, limit))
}

export function readBridgeMessage(
  id: string,
  options: ClaudeCodeInventoryOptions = {},
): BridgeMessage | null {
  const root = ensureBridgeLayout(options)
  return safeReadJson(messagePath(root, id.trim()))
}

export function markBridgeMessage(
  id: string,
  status: BridgeMessageStatus,
  options: ClaudeCodeInventoryOptions = {},
): BridgeMessage | null {
  const root = ensureBridgeLayout(options)
  const path = messagePath(root, id.trim())
  const current = safeReadJson(path)
  if (current === null) return null
  const next: BridgeMessage = {
    ...current,
    status,
    updatedAt: new Date().toISOString(),
  }
  atomicWriteJson(path, next)
  return next
}

export function getBridgeStatus(options: ClaudeCodeInventoryOptions = {}): BridgeStatus {
  const root = ensureBridgeLayout(options)
  const toClaude = listBridgeMessages({ ...options, box: "to-claude", status: "pending", limit: 10_000 })
  const toLfg = listBridgeMessages({ ...options, box: "to-lfg", status: "pending", limit: 10_000 })
  const all = listBridgeMessages({ ...options, box: "all", status: "any", limit: 10_000 })
  const claudeBinary = resolveClaudeBinary(options)
  return {
    ok: true,
    status: "claude_code_bridge",
    bridgeRoot: root,
    pendingToClaude: toClaude.length,
    pendingToLfg: toLfg.length,
    total: all.length,
    claudeBinary,
    claudeBinaryAvailable: claudeBinary !== null,
  }
}

/** Resolve Claude Code CLI path if present (no network). */
export function resolveClaudeBinary(options: ClaudeCodeInventoryOptions = {}): string | null {
  const env = options.env ?? process.env
  if (typeof env.CLAUDE_CLI === "string" && env.CLAUDE_CLI.trim().length > 0) {
    return env.CLAUDE_CLI.trim()
  }
  const home = options.homeDir?.trim() || env.HOME || ""
  const candidates = [
    join(home, ".local", "bin", "claude"),
    "/opt/homebrew/bin/claude",
    "/usr/local/bin/claude",
  ]
  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  return null
}

function messagePath(bridgeRoot: string, id: string): string {
  const safe = id.replace(/[^a-zA-Z0-9._-]/g, "")
  return join(bridgeRoot, MESSAGES_DIR, `${safe}.json`)
}

function atomicWriteJson(path: string, value: unknown): void {
  const tmp = `${path}.${process.pid}.tmp`
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8")
  renameSync(tmp, path)
}

function safeReadJson(path: string): BridgeMessage | null {
  try {
    if (!existsSync(path)) return null
    const raw = JSON.parse(readFileSync(path, "utf8")) as unknown
    if (!isBridgeMessage(raw)) return null
    return raw
  } catch {
    return null
  }
}

function isBridgeMessage(value: unknown): value is BridgeMessage {
  if (typeof value !== "object" || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.id === "string" &&
    (v.direction === "lfg_to_claude" || v.direction === "claude_to_lfg") &&
    (v.status === "pending" || v.status === "read" || v.status === "replied") &&
    typeof v.createdAt === "string" &&
    typeof v.updatedAt === "string" &&
    typeof v.body === "string" &&
    typeof v.source === "string"
  )
}
