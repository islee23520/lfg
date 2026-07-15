#!/usr/bin/env node
/**
 * PreToolUse: Sisyphus / Watcher / Explorer MUST NOT edit product code.
 * External Codex implements. Deny edit-class tools for CEO agents.
 *
 * Grok PreToolUse: stdout {"decision":"deny","reason":"..."} and exit 2.
 * Fail-open only when agent identity is unknown (do not brick host tools).
 */
import { stdin as input, stdout as output } from "node:process"

const ORCHESTRATOR_AGENTS = /\b(sisyphus|watcher|explorer|sisyphus-orchestrator)\b/i

/** Product-mutating tools Grok CEO must not use. */
const DENY_TOOL_NAMES =
  /^(search_replace|multi_edit|multiedit|MultiEdit|edit|Edit|write|Write|apply_patch|ApplyPatch|str_replace|StrReplace|create_file|CreateFile|delete_file|DeleteFile|notebook_edit|NotebookEdit)$/i

const SHELL_CONTROL = /(?:\r|\n|&&|\|\||[;|<>`$])/u
const EXPLICITLY_DENIED_SHELL =
  /^(?:npm\b|node\b|npx\s+(?:-y\s+)?(?:vitest\b|npm\b)|git\s+(?:add|commit)\b)|\b(?:sed\s+-i|tee\b)/i
const ALLOW_SHELL =
  /^(?:lfg(?:\s|$)|npx\s+(?:-y\s+)?@islee23520\/lfg(?:\s|$)|codex(?:\s|$)|(?:ls|pwd|cat|head|tail|rg|grep|which)(?:\s|$)|git\s+(?:status|log|diff|show)(?:\s|$))/i

async function main() {
  const raw = await readStdin()
  let payload = {}
  try {
    payload = raw.trim().length === 0 ? {} : JSON.parse(raw)
  } catch {
    // Fail open on malformed JSON so host is not bricked.
    process.exit(0)
  }

  const agentRaw = detectAgent(payload)
  // Main session sticky default is sisyphus — treat unlabeled main as CEO.
  const agent = agentRaw === null || agentRaw === "default" ? "sisyphus" : agentRaw
  const isOrchestrator = ORCHESTRATOR_AGENTS.test(agent)
  // Explicit implementers / other subagents: allow
  if (!isOrchestrator && agentRaw !== null && agentRaw !== "default") {
    process.exit(0)
  }

  const toolName =
    firstString(payload, ["toolName", "tool_name", "name"]) ??
    firstString(payload.toolInput ?? {}, ["name"]) ??
    ""

  // Product edit tools: always deny on main/CEO path (including unlabeled main session).
  if (DENY_TOOL_NAMES.test(toolName) && (isOrchestrator || agentRaw === null || agentRaw === "default")) {
    deny(
      `LFG CEO lock: agent "${agent}" cannot use ${toolName}. ` +
        `Sisyphus does not edit product files. ` +
        `MUST: lfg --json handoff plan --role coding --engine gpt --focus "…" then launch Codex.`,
    )
  }

  // Shell / bash that mutates product — deny for orchestrator / main CEO.
  if (
    /^(bash|Bash|shell|Shell|run_terminal_command|run_command)$/i.test(toolName) &&
    (isOrchestrator || agentRaw === null || agentRaw === "default")
  ) {
    const command =
      firstString(payload.toolInput ?? {}, ["command", "cmd", "script"]) ??
      firstString(payload, ["command"]) ??
      ""
    const trimmedCommand = command.trim()
    const allowedShell =
      trimmedCommand.length > 0 &&
      !SHELL_CONTROL.test(trimmedCommand) &&
      !EXPLICITLY_DENIED_SHELL.test(trimmedCommand) &&
      ALLOW_SHELL.test(trimmedCommand)
    if (!allowedShell) {
      deny(
        `LFG CEO lock: agent "${agent}" cannot run mutating shell. ` +
          `Delegate to Codex: lfg --json handoff plan --engine gpt --focus "…". ` +
          `Allowed: lfg orchestrator/*, handoff, codex, read-only inspect.`,
      )
    }
  }

  process.exit(0)
}

function detectAgent(payload) {
  const direct =
    firstString(payload, [
      "agentName",
      "agent_name",
      "agent",
      "subagent_type",
      "subagentType",
      "role",
      "activeAgent",
      "sessionAgent",
    ]) ??
    firstString(payload.agent ?? {}, ["name", "type", "id"]) ??
    firstString(payload.subagent ?? {}, ["name", "type", "id"])
  if (direct) return direct

  const envAgent =
    process.env.GROK_AGENT_NAME ||
    process.env.GROK_ACTIVE_AGENT ||
    process.env.LFG_AGENT_NAME ||
    process.env.AGENT_NAME
  if (typeof envAgent === "string" && envAgent.length > 0) return envAgent

  return null
}

function deny(reason) {
  output.write(`${JSON.stringify({ decision: "deny", reason })}\n`)
  process.exit(2)
}

function firstString(record, keys) {
  if (typeof record !== "object" || record === null) return null
  for (const key of keys) {
    const value = record[key]
    if (typeof value === "string" && value.length > 0) return value
  }
  return null
}

function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = []
    input.on("data", (c) => chunks.push(c))
    input.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")))
    input.on("error", reject)
  })
}

main().catch(() => process.exit(0))
