#!/usr/bin/env node
import { spawnSync } from "node:child_process"

const command = process.env.LFG_ACCOUNT_ROTATE_COMMAND || "lfg"
const args = parseArgs(process.env.LFG_ACCOUNT_ROTATE_ARGS) || ["--json", "accounts", "rotate"]
const result = spawnSync(command, args, { encoding: "utf8", timeout: 4_000 })
const receipt = parseReceipt(result.stdout)
if (receipt?.status === "auth_expired_login_required") {
  process.stdout.write(`${JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: "<lfg-account-auth status=\"auth_expired_login_required\">All enabled Grok account snapshots are expired and cannot refresh. Run `grok login`, then re-import the account before continuing.</lfg-account-auth>",
    },
    statusMessage: "LFG: Grok login required",
  })}\n`)
}

function parseArgs(value) {
  if (!value) return null
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) && parsed.every((item) => typeof item === "string") ? parsed : null
  } catch {
    return null
  }
}

function parseReceipt(value) {
  try {
    const parsed = JSON.parse(value || "null")
    return parsed && typeof parsed === "object" ? parsed : null
  } catch {
    return null
  }
}
