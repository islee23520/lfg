import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import {
  encodeClaudeProjectKey,
  listBridgeMessages,
  markBridgeMessage,
  readClaudeMemory,
  scanClaudeMemories,
  sendBridgeMessage,
} from "./index"

function fixtureClaudeHome(): string {
  const root = mkdtempSync(join(tmpdir(), "lfg-claude-mem-"))
  const claudeHome = join(root, ".claude")
  const projectKey = encodeClaudeProjectKey("/Users/demo/workspace/app")
  const memoryDir = join(claudeHome, "projects", projectKey, "memory")
  mkdirSync(memoryDir, { recursive: true })
  writeFileSync(
    join(memoryDir, "MEMORY.md"),
    `# Memory Index\n\n- [demo-note](demo-note.md) — hello\n`,
    "utf8",
  )
  writeFileSync(
    join(memoryDir, "demo-note.md"),
    `---\nname: demo-note\ndescription: Demo memory note\nmetadata:\n  type: project\n  originSessionId: ses-1\n---\n\nRemember to run tests after install.\n`,
    "utf8",
  )
  return claudeHome
}

describe("claude memory + bridge", () => {
  test("scans project memory and reads a note", () => {
    const claudeHome = fixtureClaudeHome()
    const inv = scanClaudeMemories({ claudeHome })
    expect(inv.entryCount).toBeGreaterThanOrEqual(2)
    expect(inv.projects.some((p) => p.hasIndex)).toBe(true)
    const hit = readClaudeMemory("demo-note", { claudeHome })
    expect(hit?.body).toMatch(/run tests after install/i)
    expect(hit?.entry.description).toMatch(/Demo memory/i)
  })

  test("bridge send list mark round-trip", () => {
    const claudeHome = fixtureClaudeHome()
    const sent = sendBridgeMessage("hello from lfg", {
      claudeHome,
      direction: "lfg_to_claude",
      cwd: "/tmp",
      source: "test",
    })
    expect(sent.id.length).toBeGreaterThan(8)
    const list = listBridgeMessages({ claudeHome, box: "to-claude", status: "pending" })
    expect(list.some((m) => m.id === sent.id)).toBe(true)
    const marked = markBridgeMessage(sent.id, "read", { claudeHome })
    expect(marked?.status).toBe("read")
    const reply = sendBridgeMessage("ack from claude side", {
      claudeHome,
      direction: "claude_to_lfg",
      replyTo: sent.id,
      source: "test",
    })
    expect(reply.replyTo).toBe(sent.id)
    const toLfg = listBridgeMessages({ claudeHome, box: "to-lfg", status: "pending" })
    expect(toLfg.some((m) => m.id === reply.id)).toBe(true)
  })
})
