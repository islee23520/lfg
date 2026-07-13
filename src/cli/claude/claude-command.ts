import type { JsonObject } from "../../shared/json"
import {
  askClaudeCode,
  findClaudePlugin,
  findClaudeSkill,
  getBridgeStatus,
  listBridgeMessages,
  markBridgeMessage,
  readBridgeMessage,
  readClaudeMemory,
  readClaudeSkillBody,
  scanClaudeCodeInventory,
  scanClaudeMemories,
  sendBridgeMessage,
  type ClaudeCodeInventoryOptions,
  type ClaudePluginInfo,
  type ClaudeSkillInfo,
} from "../../core/lfg/claude-code-inventory"

export type ClaudeCommandOptions = {
  readonly json: boolean
  readonly rest: readonly string[]
  readonly env?: Readonly<Record<string, string | undefined>>
  readonly cwd?: string
  readonly homeDir?: string
  readonly claudeHome?: string
}

export async function dispatchClaudeCommand(
  subcommand: string | undefined,
  third: string | undefined,
  options: ClaudeCommandOptions,
): Promise<JsonObject | string> {
  const action = subcommand ?? "inventory"
  if (action === "help" || action === "--help" || action === "-h") {
    return claudeHelp()
  }

  const scanOpts = buildScanOptions(options)

  if (action === "inventory" || action === "list") {
    const inv = scanClaudeCodeInventory(scanOpts)
    if (options.json) return inventoryJson(inv)
    return formatInventory(inv)
  }

  if (action === "status") {
    return claudeStatus(options, scanOpts)
  }

  if (action === "memory" || action === "memories") {
    return dispatchMemory(third, options, scanOpts)
  }

  if (action === "message" || action === "msg" || action === "bridge") {
    return dispatchMessage(third, options, scanOpts)
  }

  if (action === "ask") {
    return dispatchAsk(third, options, scanOpts)
  }

  if (action === "skills" || action === "skill") {
    if (third !== undefined && third.length > 0 && third !== "--json") {
      return skillDetail(third, options, scanOpts)
    }
    const inv = scanClaudeCodeInventory(scanOpts)
    if (options.json) {
      return {
        ok: true,
        status: "claude_code_skills",
        claudeHome: inv.claudeHome,
        count: inv.skillCount,
        skills: inv.skills.map(skillJson),
        lfgIsPlugin: false,
      }
    }
    return formatSkills(inv.skills, inv.claudeHome)
  }

  if (action === "plugins" || action === "plugin") {
    if (third !== undefined && third.length > 0 && third !== "--json") {
      return pluginDetail(third, options, scanOpts)
    }
    const inv = scanClaudeCodeInventory(scanOpts)
    if (options.json) {
      return {
        ok: true,
        status: "claude_code_plugins",
        claudeHome: inv.claudeHome,
        count: inv.pluginCount,
        enabledCount: inv.enabledPluginCount,
        plugins: inv.plugins.map(pluginJson),
        marketplaces: inv.marketplaces,
        lfgIsPlugin: false,
      }
    }
    return formatPlugins(inv.plugins, inv.marketplaces, inv.claudeHome)
  }

  if (action === "read") {
    const name = third ?? options.rest[0]
    if (name === undefined || name.length === 0) {
      return options.json
        ? { ok: false, status: "claude_code_read_missing_name", error: "Usage: lfg claude read <skill-name>", lfgIsPlugin: false }
        : "Usage: lfg claude read <skill-name>\n" + claudeHelp()
    }
    return skillDetail(name, options, { ...scanOpts, includeMarketplaceSkills: true })
  }

  return options.json
    ? {
        ok: false,
        status: "claude_unknown_command",
        error: `Unknown claude subcommand "${action}"`,
        supported: ["inventory", "status", "skills", "plugins", "memory", "message", "ask", "read", "help"],
        lfgIsPlugin: false,
      }
    : `Unknown claude subcommand "${action}".\n${claudeHelp()}`
}

async function claudeStatus(
  options: ClaudeCommandOptions,
  scanOpts: ClaudeCodeInventoryOptions,
): Promise<JsonObject | string> {
  const inv = scanClaudeCodeInventory(scanOpts)
  const mem = scanClaudeMemories(scanOpts)
  const bridge = getBridgeStatus(scanOpts)
  if (options.json) {
    return {
      ok: true,
      status: "claude_code_status",
      skills: inv.skillCount,
      plugins: inv.pluginCount,
      memoryProjects: mem.projectCount,
      memoryEntries: mem.entryCount,
      bridge: {
        root: bridge.bridgeRoot,
        pendingToClaude: bridge.pendingToClaude,
        pendingToLfg: bridge.pendingToLfg,
        total: bridge.total,
        claudeBinary: bridge.claudeBinary,
        claudeBinaryAvailable: bridge.claudeBinaryAvailable,
      },
      claudeHome: inv.claudeHome,
      lfgIsPlugin: false,
    }
  }
  return [
    "Claude Code status (lfg)",
    `  home: ${inv.claudeHome}`,
    `  skills: ${inv.skillCount}`,
    `  plugins: ${inv.pluginCount}`,
    `  memory projects: ${mem.projectCount} (${mem.entryCount} entries)`,
    `  bridge: ${bridge.bridgeRoot}`,
    `    pending → claude: ${bridge.pendingToClaude}`,
    `    pending → lfg: ${bridge.pendingToLfg}`,
    `  claude CLI: ${bridge.claudeBinaryAvailable ? bridge.claudeBinary : "(not found)"}`,
  ].join("\n")
}

function dispatchMemory(
  third: string | undefined,
  options: ClaudeCommandOptions,
  scanOpts: ClaudeCodeInventoryOptions,
): JsonObject | string {
  const sub = third ?? "list"
  if (sub === "list" || sub === "projects") {
    const mem = scanClaudeMemories(scanOpts)
    if (options.json) {
      return {
        ok: true,
        status: "claude_code_memory",
        claudeHome: mem.claudeHome,
        projectCount: mem.projectCount,
        entryCount: mem.entryCount,
        projects: mem.projects.map((p) => ({ ...p })),
        entries: mem.entries.map((e) => ({ ...e })),
        lfgIsPlugin: false,
      }
    }
    const lines = [
      `Claude Code memory (${mem.entryCount} entries / ${mem.projectCount} projects)`,
      "",
    ]
    for (const p of mem.projects) {
      lines.push(`## ${p.projectPath ?? p.projectKey} (${p.entryCount})`)
      lines.push(`  dir: ${p.memoryDir}`)
      for (const e of mem.entries.filter((x) => x.projectKey === p.projectKey)) {
        const tag = e.isIndex ? "[index]" : e.type ? `[${e.type}]` : ""
        lines.push(`  - ${e.name} ${tag}`)
        if (e.description) lines.push(`      ${e.description.slice(0, 100)}`)
      }
      lines.push("")
    }
    if (mem.entryCount === 0) lines.push("(no project memory found under ~/.claude/projects/*/memory)")
    return lines.join("\n")
  }
  if (sub === "read") {
    const name = options.rest[0]
    if (name === undefined || name.length === 0) {
      return options.json
        ? { ok: false, status: "claude_memory_missing_name", error: "Usage: lfg claude memory read <name>", lfgIsPlugin: false }
        : "Usage: lfg claude memory read <name-or-path>"
    }
    const hit = readClaudeMemory(name, scanOpts)
    if (hit === null) {
      return options.json
        ? { ok: false, status: "claude_memory_not_found", error: `Memory not found: ${name}`, lfgIsPlugin: false }
        : `Memory not found: ${name}`
    }
    if (options.json) {
      return {
        ok: true,
        status: "claude_memory_detail",
        entry: { ...hit.entry },
        body: hit.body,
        lfgIsPlugin: false,
      }
    }
    return [
      `Memory: ${hit.entry.name}`,
      `Path: ${hit.entry.path}`,
      hit.entry.projectPath ? `Project: ${hit.entry.projectPath}` : null,
      hit.entry.type ? `Type: ${hit.entry.type}` : null,
      "",
      hit.body,
    ]
      .filter((line) => line !== null)
      .join("\n")
  }
  // treat third as memory name for `lfg claude memory <name>`
  const hit = readClaudeMemory(sub, scanOpts)
  if (hit !== null) {
    if (options.json) {
      return { ok: true, status: "claude_memory_detail", entry: { ...hit.entry }, body: hit.body, lfgIsPlugin: false }
    }
    return `${hit.entry.name}\n${hit.entry.path}\n\n${hit.body}`
  }
  return options.json
    ? { ok: false, status: "claude_memory_unknown", error: `Unknown memory subcommand: ${sub}`, lfgIsPlugin: false }
    : `Unknown memory subcommand "${sub}". Use: list | read <name>`
}

function dispatchMessage(
  third: string | undefined,
  options: ClaudeCommandOptions,
  scanOpts: ClaudeCodeInventoryOptions,
): JsonObject | string {
  const sub = third ?? "list"
  if (sub === "send") {
    const bodyParts = [...options.rest]
    let direction: "lfg_to_claude" | "claude_to_lfg" = "lfg_to_claude"
    const toIdx = bodyParts.indexOf("--to")
    if (toIdx >= 0) {
      const dest = bodyParts[toIdx + 1]
      bodyParts.splice(toIdx, 2)
      if (dest === "lfg" || dest === "grok") direction = "claude_to_lfg"
      else direction = "lfg_to_claude"
    }
    const body = bodyParts.join(" ").trim()
    if (body.length === 0) {
      return options.json
        ? { ok: false, status: "claude_message_empty", error: "Usage: lfg claude message send [--to claude|lfg] <text>", lfgIsPlugin: false }
        : "Usage: lfg claude message send [--to claude|lfg] <text>"
    }
    const msg = sendBridgeMessage(body, {
      ...scanOpts,
      direction,
      cwd: options.cwd ?? process.cwd(),
      source: "lfg",
    })
    if (options.json) return { ok: true, status: "claude_message_sent", message: { ...msg }, lfgIsPlugin: false }
    return `Sent ${msg.id} (${msg.direction})\n${msg.body}`
  }
  if (sub === "list" || sub === "inbox" || sub === "outbox") {
    let box: "to-claude" | "to-lfg" | "all" = "all"
    if (sub === "inbox") box = "to-lfg"
    if (sub === "outbox") box = "to-claude"
    if (options.rest.includes("--box")) {
      const i = options.rest.indexOf("--box")
      const v = options.rest[i + 1]
      if (v === "to-claude" || v === "outbox") box = "to-claude"
      else if (v === "to-lfg" || v === "inbox") box = "to-lfg"
    }
    const statusArg = options.rest.includes("--pending") ? "pending" : "any"
    const msgs = listBridgeMessages({
      ...scanOpts,
      box,
      status: statusArg === "pending" ? "pending" : "any",
      limit: 50,
    })
    if (options.json) {
      return {
        ok: true,
        status: "claude_message_list",
        box,
        count: msgs.length,
        messages: msgs.map((m) => ({ ...m })),
        lfgIsPlugin: false,
      }
    }
    if (msgs.length === 0) return `(no messages in ${box})`
    return msgs
      .map((m) => `${m.id.slice(0, 8)}…  ${m.direction}  ${m.status}  ${m.createdAt}\n  ${m.body.slice(0, 120)}`)
      .join("\n\n")
  }
  if (sub === "read") {
    const id = options.rest[0]
    if (!id) {
      return options.json
        ? { ok: false, status: "claude_message_missing_id", error: "Usage: lfg claude message read <id>", lfgIsPlugin: false }
        : "Usage: lfg claude message read <id>"
    }
    const msg = readBridgeMessage(id, scanOpts)
    if (msg === null) {
      return options.json
        ? { ok: false, status: "claude_message_not_found", error: `Message not found: ${id}`, lfgIsPlugin: false }
        : `Message not found: ${id}`
    }
    if (msg.status === "pending") markBridgeMessage(id, "read", scanOpts)
    if (options.json) return { ok: true, status: "claude_message_detail", message: { ...msg }, lfgIsPlugin: false }
    return [
      `id: ${msg.id}`,
      `direction: ${msg.direction}`,
      `status: ${msg.status}`,
      `created: ${msg.createdAt}`,
      msg.cwd ? `cwd: ${msg.cwd}` : null,
      "",
      msg.body,
    ]
      .filter((line) => line !== null)
      .join("\n")
  }
  if (sub === "mark") {
    const id = options.rest[0]
    const st = options.rest[1]
    if (!id || (st !== "read" && st !== "replied" && st !== "pending")) {
      return options.json
        ? { ok: false, status: "claude_message_mark_usage", error: "Usage: lfg claude message mark <id> pending|read|replied", lfgIsPlugin: false }
        : "Usage: lfg claude message mark <id> pending|read|replied"
    }
    const msg = markBridgeMessage(id, st, scanOpts)
    if (msg === null) {
      return options.json
        ? { ok: false, status: "claude_message_not_found", error: `Message not found: ${id}`, lfgIsPlugin: false }
        : `Message not found: ${id}`
    }
    if (options.json) return { ok: true, status: "claude_message_marked", message: { ...msg }, lfgIsPlugin: false }
    return `Marked ${msg.id} → ${msg.status}`
  }
  if (sub === "status") {
    const bridge = getBridgeStatus(scanOpts)
    if (options.json) return { ...bridge, lfgIsPlugin: false }
    return [
      `bridge: ${bridge.bridgeRoot}`,
      `pending → claude: ${bridge.pendingToClaude}`,
      `pending → lfg: ${bridge.pendingToLfg}`,
      `total: ${bridge.total}`,
      `claude CLI: ${bridge.claudeBinaryAvailable ? bridge.claudeBinary : "(missing)"}`,
    ].join("\n")
  }
  return options.json
    ? { ok: false, status: "claude_message_unknown", error: `Unknown message subcommand: ${sub}`, lfgIsPlugin: false }
    : `Unknown message subcommand "${sub}". Use: send | list | read | mark | status`
}

async function dispatchAsk(
  third: string | undefined,
  options: ClaudeCommandOptions,
  scanOpts: ClaudeCodeInventoryOptions,
): Promise<JsonObject | string> {
  const askFlags = new Set(["--bridge-only", "--no-spawn", "--json"])
  const prompt = [third, ...options.rest]
    .filter((p): p is string => typeof p === "string" && p.length > 0 && !askFlags.has(p))
    .join(" ")
    .trim()
  if (prompt.length === 0) {
    return options.json
      ? { ok: false, status: "claude_ask_empty", error: "Usage: lfg claude ask <prompt>", lfgIsPlugin: false }
      : "Usage: lfg claude ask <prompt>"
  }
  // Also leave a bridge copy so communication is durable even if CLI fails.
  const bridgeMsg = sendBridgeMessage(prompt, {
    ...scanOpts,
    direction: "lfg_to_claude",
    cwd: options.cwd ?? process.cwd(),
    source: "lfg-ask",
  })
  const dry =
    options.rest.includes("--bridge-only") ||
    options.rest.includes("--no-spawn") ||
    third === "--bridge-only"
  if (dry) {
    if (options.json) {
      return {
        ok: true,
        status: "claude_ask_bridged",
        message: { ...bridgeMsg },
        note: "bridge-only; did not spawn claude CLI",
        lfgIsPlugin: false,
      }
    }
    return `Bridged only (no CLI spawn): ${bridgeMsg.id}\n${prompt}`
  }
  const result = await askClaudeCode(prompt, {
    ...scanOpts,
    cwd: options.cwd ?? process.cwd(),
    timeoutMs: 180_000,
  })
  if (result.ok && result.stdout.trim().length > 0) {
    sendBridgeMessage(result.stdout, {
      ...scanOpts,
      direction: "claude_to_lfg",
      cwd: options.cwd ?? process.cwd(),
      replyTo: bridgeMsg.id,
      source: "claude-cli",
    })
    markBridgeMessage(bridgeMsg.id, "replied", scanOpts)
  }
  if (options.json) {
    return {
      ok: result.ok,
      status: result.status,
      claudeBinary: result.claudeBinary,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      durationMs: result.durationMs,
      bridgeMessageId: bridgeMsg.id,
      lfgIsPlugin: false,
    }
  }
  if (!result.ok) {
    return [
      `claude ask failed (${result.status})`,
      result.claudeBinary ? `cli: ${result.claudeBinary}` : "cli: missing",
      result.stderr || "(no stderr)",
      `bridge copy: ${bridgeMsg.id}`,
    ].join("\n")
  }
  return result.stdout
}

function buildScanOptions(options: ClaudeCommandOptions): ClaudeCodeInventoryOptions {
  const includeMarketplaceSkills = options.rest.includes("--with-marketplace-skills")
  return {
    ...(options.claudeHome !== undefined ? { claudeHome: options.claudeHome } : {}),
    ...(options.homeDir !== undefined ? { homeDir: options.homeDir } : {}),
    ...(options.env !== undefined ? { env: options.env } : { env: process.env }),
    projectRoot: options.cwd ?? process.cwd(),
    includeAgentsSkills: !options.rest.includes("--no-agents-skills"),
    includeMarketplacePlugins: !options.rest.includes("--no-marketplace"),
    includeMarketplaceSkills,
  }
}

function skillDetail(
  name: string,
  options: ClaudeCommandOptions,
  scanOpts: ClaudeCodeInventoryOptions,
): JsonObject | string {
  const wantBody = options.rest.includes("--body") || options.rest.includes("--full")
  if (wantBody) {
    const body = readClaudeSkillBody(name, { ...scanOpts, includeMarketplaceSkills: true })
    if (body === null) {
      return options.json
        ? { ok: false, status: "claude_skill_not_found", error: `Skill not found: ${name}`, lfgIsPlugin: false }
        : `Skill not found: ${name}`
    }
    if (options.json) {
      return {
        ok: true,
        status: "claude_skill_detail",
        skill: skillJson(body.skill),
        skillMd: body.skillMd,
        lfgIsPlugin: false,
      }
    }
    return [
      `Skill: ${body.skill.name}`,
      `Path: ${body.skill.path}`,
      `Source: ${body.skill.source}`,
      body.skill.description ? `Description: ${body.skill.description}` : null,
      "",
      "--- SKILL.md ---",
      body.skillMd,
    ]
      .filter((line) => line !== null)
      .join("\n")
  }
  const skill = findClaudeSkill(name, { ...scanOpts, includeMarketplaceSkills: true })
  if (skill === null) {
    return options.json
      ? { ok: false, status: "claude_skill_not_found", error: `Skill not found: ${name}`, lfgIsPlugin: false }
      : `Skill not found: ${name}`
  }
  if (options.json) {
    return { ok: true, status: "claude_skill_detail", skill: skillJson(skill), lfgIsPlugin: false }
  }
  return [
    `Skill: ${skill.name}`,
    `Dir: ${skill.dirName}`,
    `Path: ${skill.path}`,
    `Source: ${skill.source}`,
    skill.marketplace ? `Marketplace: ${skill.marketplace}` : null,
    skill.plugin ? `Plugin: ${skill.plugin}` : null,
    skill.description ? `Description: ${skill.description}` : null,
    `References: ${skill.hasReferences ? "yes" : "no"}`,
    `Scripts: ${skill.hasScripts ? "yes" : "no"}`,
    "",
    "Read full body: lfg claude skill <name> --body",
  ]
    .filter((line) => line !== null)
    .join("\n")
}

function pluginDetail(
  name: string,
  options: ClaudeCommandOptions,
  scanOpts: ClaudeCodeInventoryOptions,
): JsonObject | string {
  const plugin = findClaudePlugin(name, scanOpts)
  if (plugin === null) {
    return options.json
      ? { ok: false, status: "claude_plugin_not_found", error: `Plugin not found: ${name}`, lfgIsPlugin: false }
      : `Plugin not found: ${name}`
  }
  if (options.json) {
    return { ok: true, status: "claude_plugin_detail", plugin: pluginJson(plugin), lfgIsPlugin: false }
  }
  return [
    `Plugin: ${plugin.name}`,
    `Path: ${plugin.path}`,
    plugin.marketplace ? `Marketplace: ${plugin.marketplace}` : null,
    `Source: ${plugin.sourceKind}`,
    `Enabled: ${plugin.enabled ? "yes" : "no"}`,
    plugin.version ? `Version: ${plugin.version}` : null,
    plugin.author ? `Author: ${plugin.author}` : null,
    plugin.description ? `Description: ${plugin.description}` : null,
    plugin.skills.length > 0 ? `Skills: ${plugin.skills.join(", ")}` : "Skills: (none scanned)",
    plugin.keywords.length > 0 ? `Keywords: ${plugin.keywords.join(", ")}` : null,
  ]
    .filter((line) => line !== null)
    .join("\n")
}

function inventoryJson(inv: ReturnType<typeof scanClaudeCodeInventory>): JsonObject {
  return {
    ok: true,
    status: inv.status,
    claudeHome: inv.claudeHome,
    claudeHomeExists: inv.claudeHomeExists,
    skillCount: inv.skillCount,
    pluginCount: inv.pluginCount,
    marketplaceCount: inv.marketplaceCount,
    enabledPluginCount: inv.enabledPluginCount,
    skills: inv.skills.map(skillJson),
    plugins: inv.plugins.map(pluginJson),
    marketplaces: inv.marketplaces.map((m) => ({ ...m })),
    settings: { ...inv.settings },
    lfgIsPlugin: false,
  }
}

function skillJson(skill: ClaudeSkillInfo): JsonObject {
  return {
    name: skill.name,
    dirName: skill.dirName,
    path: skill.path,
    description: skill.description,
    source: skill.source,
    marketplace: skill.marketplace,
    plugin: skill.plugin,
    hasReferences: skill.hasReferences,
    hasScripts: skill.hasScripts,
  }
}

function pluginJson(plugin: ClaudePluginInfo): JsonObject {
  return {
    name: plugin.name,
    description: plugin.description,
    version: plugin.version,
    author: plugin.author,
    path: plugin.path,
    marketplace: plugin.marketplace,
    sourceKind: plugin.sourceKind,
    enabled: plugin.enabled,
    skillCount: plugin.skillCount,
    skills: [...plugin.skills],
    keywords: [...plugin.keywords],
  }
}

function formatInventory(inv: ReturnType<typeof scanClaudeCodeInventory>): string {
  const lines = [
    "Claude Code inventory (lfg)",
    `  claude home: ${inv.claudeHome} (${inv.claudeHomeExists ? "exists" : "missing"})`,
    `  skills: ${inv.skillCount}`,
    `  plugins: ${inv.pluginCount} (${inv.enabledPluginCount} enabled)`,
    `  marketplaces: ${inv.marketplaceCount}`,
  ]
  if (inv.settings.exists) {
    lines.push(
      `  settings: model=${inv.settings.model ?? "(none)"} envKeys=${inv.settings.envKeys.join(",") || "(none)"} (values never printed)`,
    )
  }
  lines.push("")
  lines.push("Skills (name ← source):")
  for (const skill of inv.skills.slice(0, 40)) {
    lines.push(`  - ${skill.name} ← ${skill.source}${skill.plugin ? ` / ${skill.plugin}` : ""}`)
  }
  if (inv.skills.length > 40) lines.push(`  … +${inv.skills.length - 40} more (use: lfg --json claude skills)`)
  lines.push("")
  lines.push("Plugins:")
  for (const plugin of inv.plugins.slice(0, 30)) {
    const flag = plugin.enabled ? "ON " : "   "
    lines.push(`  ${flag}${plugin.name}${plugin.marketplace ? ` [${plugin.marketplace}]` : ""}`)
  }
  if (inv.plugins.length > 30) lines.push(`  … +${inv.plugins.length - 30} more (use: lfg --json claude plugins)`)
  lines.push("")
  lines.push("Commands: lfg claude skills | plugins | skill <name> [--body] | plugin <name>")
  return lines.join("\n")
}

function formatSkills(skills: readonly ClaudeSkillInfo[], claudeHome: string): string {
  const lines = [`Claude Code skills (${skills.length}) — home ${claudeHome}`, ""]
  for (const skill of skills) {
    const desc = skill.description ? ` — ${skill.description.slice(0, 100)}` : ""
    lines.push(`${skill.name}  [${skill.source}]${desc}`)
    lines.push(`  ${skill.path}`)
  }
  if (skills.length === 0) lines.push("(none found)")
  return lines.join("\n")
}

function formatPlugins(
  plugins: readonly ClaudePluginInfo[],
  marketplaces: ReturnType<typeof scanClaudeCodeInventory>["marketplaces"],
  claudeHome: string,
): string {
  const lines = [`Claude Code plugins (${plugins.length}) — home ${claudeHome}`, ""]
  if (marketplaces.length > 0) {
    lines.push("Marketplaces:")
    for (const mp of marketplaces) {
      lines.push(`  - ${mp.id}: ${mp.pluginCount} plugins${mp.sourceLabel ? ` (${mp.sourceLabel})` : ""}`)
    }
    lines.push("")
  }
  for (const plugin of plugins) {
    const on = plugin.enabled ? "enabled" : "available"
    lines.push(`${plugin.name}  [${on}/${plugin.sourceKind}]`)
    if (plugin.description) lines.push(`  ${plugin.description.slice(0, 120)}`)
    lines.push(`  ${plugin.path}`)
  }
  if (plugins.length === 0) lines.push("(none found)")
  return lines.join("\n")
}

export function claudeHelp(): string {
  return [
    "lfg claude — Claude Code plugins, skills, memory, and cross-agent bridge",
    "",
    "Inventory:",
    "  lfg claude inventory                 # skills + plugins + marketplaces",
    "  lfg claude status                    # skills/plugins/memory/bridge/cli",
    "  lfg claude skills | skill <name> [--body]",
    "  lfg claude plugins | plugin <name>",
    "",
    "Memory (Claude auto-memory under ~/.claude/projects/*/memory):",
    "  lfg claude memory list",
    "  lfg claude memory read <name-or-path>",
    "",
    "Bridge (durable Grok ↔ Claude mailbox under ~/.claude/lfg-bridge):",
    "  lfg claude message send [--to claude|lfg] <text>",
    "  lfg claude message list [--box to-claude|to-lfg] [--pending]",
    "  lfg claude message read <id>",
    "  lfg claude message mark <id> pending|read|replied",
    "  lfg claude message status",
    "",
    "Live ask (spawns Claude Code CLI when available):",
    "  lfg claude ask <prompt>",
    "  lfg claude ask <prompt> --bridge-only   # write mailbox only, no CLI spawn",
    "",
    "Flags:",
    "  --json  --with-marketplace-skills  --no-marketplace  --no-agents-skills",
    "",
    "Env:",
    "  CLAUDE_HOME / CLAUDE_CONFIG_DIR  # Claude config root (default ~/.claude)",
    "  CLAUDE_CLI                       # override claude binary path",
    "",
    "Safety: settings env values (tokens/keys) are never printed — only key names.",
  ].join("\n")
}
