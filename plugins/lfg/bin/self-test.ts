#!/usr/bin/env node
import { execFile } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const LFG = join(here, "lfg.js")

const checks = [
  await commandOk(["setup"], "@islee23520/lfg internal grok-install"),
  await commandOk(["setup"], "installed-plugins/lfg"),
  await commandOk(["help"], "npx @islee23520/lfg setup"),
  await commandFails(["doctor"], "unsupported_command"),
  await commandFails(["dry-setup"], "unsupported_command"),
]

for (const [index, ok] of checks.entries()) {
  process.stdout.write(`check-${index + 1}=${ok ? "ok" : "fail"}\n`)
}

process.exit(checks.every(Boolean) ? 0 : 1)

async function commandOk(args: readonly string[], expected: string, env: Readonly<Record<string, string>> = {}): Promise<boolean> {
  const result = await execFileResult(process.execPath, [LFG, "--json", ...args], env)
  return result.exitCode === 0 && result.stdout.includes(expected)
}

async function commandFails(args: readonly string[], expected: string): Promise<boolean> {
  const result = await execFileResult(process.execPath, [LFG, "--json", ...args])
  return result.exitCode !== 0 && result.stdout.includes(expected)
}

function execFileResult(file: string, args: readonly string[], env: Readonly<Record<string, string>> = {}): Promise<{ readonly exitCode: number; readonly stdout: string }> {
  return new Promise((resolve) => {
    execFile(file, [...args], { env: { ...process.env, ...env } }, (error, stdout) => {
      const exitCode = typeof error === "object" && error !== null && "code" in error && typeof error.code === "number" ? error.code : 0
      resolve({ exitCode, stdout })
    })
  })
}
