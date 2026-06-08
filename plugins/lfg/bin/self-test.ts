#!/usr/bin/env node
import { execFile } from "node:child_process"
import { cp, mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const LFG = join(here, "lfg.js")
const doctorHome = await prepareDoctorHome()

const checks = [
  await commandOk(["setup"], "npx lazycodex-ai install"),
  await commandOk(["setup"], "@islee23520/lfg internal grok-install"),
  await commandOk(["help"], "npx @islee23520/lfg setup"),
  await commandOk(["doctor"], '"command": "doctor"', { HOME: doctorHome }),
  await commandFails(["dry-setup"], "unsupported_command"),
]

for (const [index, ok] of checks.entries()) {
  process.stdout.write(`check-${index + 1}=${ok ? "ok" : "fail"}\n`)
}

process.exit(checks.every(Boolean) ? 0 : 1)

async function prepareDoctorHome(): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), "lfg-selftest-home-"))
  const fixture = join(here, "grok-install", "fixture-minimal")
  const pluginRoot = join(home, ".grok", "installed-plugins", "lazycodex")
  await mkdir(dirname(pluginRoot), { recursive: true })
  await cp(fixture, pluginRoot, { recursive: true })
  const stamp = { packageName: "@islee23520/lfg", version: "self-test", platform: "grok" }
  await writeFile(join(pluginRoot, "lfg-install.json"), `${JSON.stringify(stamp, null, 2)}\n`)
  return home
}

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
