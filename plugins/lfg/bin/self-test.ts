#!/usr/bin/env node
import { execFile } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const LFG = join(dirname(fileURLToPath(import.meta.url)), "lfg.js")

const checks = [
  await commandOk(["dry-setup"], "npx lazycodex-ai install"),
  await commandOk(["setup"], "npx lazycodex-ai install"),
  await commandOk(["doctor"], "\"ok\": true"),
  await commandFails(["install"], "unsupported_command"),
]

for (const [index, ok] of checks.entries()) {
  process.stdout.write(`check-${index + 1}=${ok ? "ok" : "fail"}\n`)
}

process.exit(checks.every(Boolean) ? 0 : 1)

async function commandOk(args: readonly string[], expected: string): Promise<boolean> {
  const result = await execFileResult(process.execPath, [LFG, "--json", ...args])
  return result.exitCode === 0 && result.stdout.includes(expected)
}

async function commandFails(args: readonly string[], expected: string): Promise<boolean> {
  const result = await execFileResult(process.execPath, [LFG, "--json", ...args])
  return result.exitCode !== 0 && result.stdout.includes(expected)
}

function execFileResult(file: string, args: readonly string[]): Promise<{ readonly exitCode: number; readonly stdout: string }> {
  return new Promise((resolve) => {
    execFile(file, [...args], (error, stdout) => {
      const exitCode = typeof error === "object" && error !== null && "code" in error && typeof error.code === "number" ? error.code : 0
      resolve({ exitCode, stdout })
    })
  })
}
