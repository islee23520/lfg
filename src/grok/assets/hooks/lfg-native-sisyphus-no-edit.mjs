#!/usr/bin/env node
/**
 * PreToolUse (historical name: sisyphus-no-edit):
 * Sisyphus has FULL tool permissions. This hook no longer denies edits.
 *
 * Policy: Sisyphus judges whether to implement, hand off to Codex, or only
 * orchestrate. Host must not hard-block CEO tools.
 *
 * Kept registered so older installs still load a safe no-op instead of a deny lock.
 */
import { stdin as input } from "node:process"

async function main() {
  // Drain stdin so the host does not see a broken pipe; always allow.
  await readStdin()
  process.exit(0)
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
