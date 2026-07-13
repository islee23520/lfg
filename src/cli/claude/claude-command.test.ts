import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { dispatchClaudeCommand } from "./claude-command"

function makeClaudeHome(): string {
  const root = mkdtempSync(join(tmpdir(), "lfg-claude-cmd-"))
  const claudeHome = join(root, ".claude")
  mkdirSync(join(claudeHome, "skills", "alpha"), { recursive: true })
  mkdirSync(join(claudeHome, "plugins"), { recursive: true })
  writeFileSync(
    join(claudeHome, "skills", "alpha", "SKILL.md"),
    `---\nname: alpha\ndescription: Alpha skill\n---\n\n# Alpha body\n`,
    "utf8",
  )
  writeFileSync(join(claudeHome, "plugins", "installed_plugins.json"), JSON.stringify({ version: 2, plugins: {} }), "utf8")
  writeFileSync(join(claudeHome, "plugins", "known_marketplaces.json"), "{}", "utf8")
  writeFileSync(
    join(claudeHome, "settings.json"),
    JSON.stringify({ model: "x", env: { SECRET: "do-not-print" }, enabledPlugins: {} }),
    "utf8",
  )
  return claudeHome
}

describe("dispatchClaudeCommand", () => {
  test("json inventory lists skills without leaking secrets", async () => {
    const claudeHome = makeClaudeHome()
    const result = await dispatchClaudeCommand("inventory", undefined, {
      json: true,
      rest: ["--no-agents-skills", "--no-marketplace"],
      claudeHome,
      cwd: tmpdir(),
    })
    expect(result).toMatchObject({ ok: true, status: "claude_code_inventory" })
    const text = JSON.stringify(result)
    expect(text).toContain("alpha")
    expect(text).not.toContain("do-not-print")
    expect(text).toContain("SECRET")
  })

  test("skill --body returns markdown", async () => {
    const claudeHome = makeClaudeHome()
    const result = await dispatchClaudeCommand("skill", "alpha", {
      json: true,
      rest: ["--body", "--no-agents-skills", "--no-marketplace"],
      claudeHome,
      cwd: tmpdir(),
    })
    expect(result).toMatchObject({ ok: true, status: "claude_skill_detail" })
    expect(JSON.stringify(result)).toContain("# Alpha body")
  })

  test("help is text", async () => {
    const help = await dispatchClaudeCommand("help", undefined, { json: false, rest: [] })
    expect(typeof help).toBe("string")
    expect(help).toContain("lfg claude")
    expect(help).toContain("memory")
    expect(help).toContain("message")
  })

  test("message send + list + memory list via CLI", async () => {
    const claudeHome = makeClaudeHome()
    // seed memory
    const { mkdirSync, writeFileSync } = await import("node:fs")
    const { join } = await import("node:path")
    const memDir = join(claudeHome, "projects", "-Users-demo-app", "memory")
    mkdirSync(memDir, { recursive: true })
    writeFileSync(join(memDir, "MEMORY.md"), "# Memory Index\n", "utf8")
    writeFileSync(
      join(memDir, "note.md"),
      `---\nname: note\ndescription: A note\n---\n\nBody of note\n`,
      "utf8",
    )

    const sent = await dispatchClaudeCommand("message", "send", {
      json: true,
      rest: ["ping from test"],
      claudeHome,
      cwd: tmpdir(),
    })
    expect(sent).toMatchObject({ ok: true, status: "claude_message_sent" })

    const list = await dispatchClaudeCommand("message", "list", {
      json: true,
      rest: ["--pending"],
      claudeHome,
      cwd: tmpdir(),
    })
    expect(list).toMatchObject({ ok: true, status: "claude_message_list" })
    expect(JSON.stringify(list)).toContain("ping from test")

    const mem = await dispatchClaudeCommand("memory", "list", {
      json: true,
      rest: [],
      claudeHome,
      cwd: tmpdir(),
    })
    expect(mem).toMatchObject({ ok: true, status: "claude_code_memory" })
    expect(JSON.stringify(mem)).toContain("note")

    const askBridge = await dispatchClaudeCommand("ask", "hello", {
      json: true,
      rest: ["--bridge-only"],
      claudeHome,
      cwd: tmpdir(),
    })
    expect(askBridge).toMatchObject({ ok: true, status: "claude_ask_bridged" })
  })
})

