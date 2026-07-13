#!/usr/bin/env node
import { execFile } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const LFG = join(here, "lfg.js")

// Isolate from the runner's real ~/.grok so CI (fresh HOME) and local installs behave the same.
const selfTestHome = process.env.LFG_SELF_TEST_HOME ?? process.env.HOME
const baseEnv: Readonly<Record<string, string>> = {
  ...(selfTestHome !== undefined ? { HOME: selfTestHome } : {}),
  LFG_ALLOW_TEST_GROK_HOME: "1",
}

const checks = [
  await commandOk(["setup"], "@islee23520/lfg internal grok-install", baseEnv),
  await commandOk(["setup"], ".", baseEnv),
  await commandOk(["help"], "npx @islee23520/lfg setup", baseEnv),
  // doctor exits non-zero when the plugin is missing; still assert the JSON contract surface.
  await commandEmits(["doctor"], '"command": "doctor"', baseEnv),
  await commandFails(["dry-setup"], "unsupported_command", baseEnv),
]

for (const [index, ok] of checks.entries()) {
  process.stdout.write(`check-${index + 1}=${ok ? "ok" : "fail"}\n`)
}

process.exit(checks.every(Boolean) ? 0 : 1)

async function commandOk(args: readonly string[], expected: string, env: Readonly<Record<string, string>> = {}): Promise<boolean> {
  const result = await execFileResult(process.execPath, [LFG, "--json", ...args], env)
  return result.exitCode === 0 && result.stdout.includes(expected)
}

/** Accept any exit code; assert JSON/text contract only (used for doctor fail surfaces). */
async function commandEmits(args: readonly string[], expected: string, env: Readonly<Record<string, string>> = {}): Promise<boolean> {
  const result = await execFileResult(process.execPath, [LFG, "--json", ...args], env)
  return result.stdout.includes(expected)
}

async function commandFails(args: readonly string[], expected: string, env: Readonly<Record<string, string>> = {}): Promise<boolean> {
  const result = await execFileResult(process.execPath, [LFG, "--json", ...args], env)
  return result.exitCode !== 0 && result.stdout.includes(expected)
}

function execFileResult(file: string, args: readonly string[], env: Readonly<Record<string, string>> = {}): Promise<{ readonly exitCode: number; readonly stdout: string }> {
  return new Promise((resolve) => {
    execFile(file, [...args], { env: { ...process.env, ...env } }, (error, stdout) => {
      const exitCode =
        typeof error === "object" && error !== null && "code" in error && typeof error.code === "number"
          ? error.code
          : 0
      resolve({ exitCode, stdout: typeof stdout === "string" ? stdout : String(stdout ?? "") })
    })
  })
}
