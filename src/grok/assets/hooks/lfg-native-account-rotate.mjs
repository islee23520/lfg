#!/usr/bin/env node
import { spawnSync } from "node:child_process"

const command = process.env.LFG_ACCOUNT_ROTATE_COMMAND || "lfg"
const args = parseArgs(process.env.LFG_ACCOUNT_ROTATE_ARGS) || ["--json", "accounts", "rotate"]
spawnSync(command, args, { stdio: "ignore", timeout: 4_000 })

function parseArgs(value) {
  if (!value) return null
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) && parsed.every((item) => typeof item === "string") ? parsed : null
  } catch {
    return null
  }
}
