import { execFile } from "node:child_process"
import { existsSync } from "node:fs"
import { chmod, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

export type ProcessResult = {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}

type NpmPackEntry = {
  readonly filename?: string
  readonly files?: readonly { readonly path?: string }[]
}

export async function packWorkspaceDryRunFilePaths(): Promise<readonly string[]> {
  const result = await execFileResult("npm", ["pack", "--workspace", "@islee23520/lfg", "--dry-run", "--json"])
  const parsed = JSON.parse(result.stdout) as readonly NpmPackEntry[]
  return parsed.flatMap((entry) => entry.files?.map((file) => file.path).filter((path): path is string => typeof path === "string") ?? [])
}

export async function packRootDryRunFilePaths(): Promise<readonly string[]> {
  const result = await runProcess("npm", ["pack", "--dry-run", "--json"], repoRoot())
  const parsed = JSON.parse(result.stdout) as readonly NpmPackEntry[]
  return parsed.flatMap((entry) => entry.files?.map((file) => file.path).filter((path): path is string => typeof path === "string") ?? [])
}

export async function packRootTarball(): Promise<string> {
  const destination = await mkdtemp(join(tmpdir(), "lfg-pack."))
  const result = await runProcess("npm", ["pack", "--json", "--pack-destination", destination], repoRoot())
  const parsed = JSON.parse(result.stdout) as readonly NpmPackEntry[]
  const filename = parsed[0]?.filename
  if (typeof filename !== "string") {
    throw new Error("npm pack did not return a tarball filename")
  }
  return join(destination, filename)
}

export async function installAndRunCommand(tarball: string, args: readonly string[], env?: NodeJS.ProcessEnv): Promise<ProcessResult> {
  return installAndRunCommandWithExecutable(tarball, "npx", args, env)
}

export async function installAndRunCommandWithExecutable(tarball: string, executable: string, args: readonly string[], env?: NodeJS.ProcessEnv): Promise<ProcessResult> {
  const cwd = await mkdtemp(join(tmpdir(), "lfg-package-smoke."))
  await runProcess("npm", ["init", "-y"], cwd)
  await runProcess("npm", ["install", tarball], cwd)
  return runProcess(executable, args, cwd, env)
}

export async function makeFakeNpx(exitCode: number): Promise<string> {
  const bin = await mkdtemp(join(tmpdir(), "lfg-fake-npx."))
  const body = exitCode === 0 ? await fakeInstallerScript() : "echo fake lazycodex failure: $* >&2"
  await writeFile(join(bin, "npx"), `#!/usr/bin/env bash\n${body}\nexit ${exitCode}\n`)
  await chmod(join(bin, "npx"), 0o755)
  return bin
}

export async function makeFakeStableNpx(): Promise<string> {
  const bin = await mkdtemp(join(tmpdir(), "lfg-fake-npx."))
  const adapterRoot = join("$HOME", ".grok", "installed-plugins", "lazycodex")
  await writeFile(
    join(bin, "npx"),
    [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      `mkdir -p "${adapterRoot}/.codex-plugin" "${adapterRoot}/skills"`,
      `printf '%s\\n' '{"name":"lazycodex","version":"0.1.0"}' > "${adapterRoot}/.codex-plugin/plugin.json"`,
      `printf '%s\\n' '{"mcpServers":{}}' > "${adapterRoot}/.mcp.json"`,
      'echo fake stable lazycodex install: "$@"',
      "",
    ].join("\n"),
  )
  await chmod(join(bin, "npx"), 0o755)
  return bin
}

export function parseTrailingJsonObject(stdout: string): Record<string, unknown> {
  const jsonStart = stdout.lastIndexOf("\n{")
  const candidate = jsonStart >= 0 ? stdout.slice(jsonStart + 1) : stdout
  return JSON.parse(candidate) as Record<string, unknown>
}

export function systemNpxPath(): string {
  const systemPath = process.env.PATH ?? ""
  for (const dir of systemPath.split(":")) {
    const candidate = join(dir, "npx")
    if (candidate.includes("lfg-fake-npx")) continue
    if (existsSync(candidate)) return candidate
  }
  throw new Error("Unable to resolve system npx path")
}

function repoRoot(): string {
  return fileURLToPath(new URL("../../..", import.meta.url))
}

function execFileResult(file: string, args: readonly string[]): Promise<ProcessResult> {
  return new Promise((resolve) => {
    execFile(file, [...args], (error, stdout, stderr) => {
      const exitCode = typeof error === "object" && error !== null && "code" in error && typeof error.code === "number" ? error.code : 0
      resolve({ exitCode, stdout, stderr })
    })
  })
}

async function fakeInstallerScript(): Promise<string> {
  const adapterRoot = join("$HOME", ".grok", "installed-plugins", "0-1-0-ff47fdd7")
  return [
    `mkdir -p "${adapterRoot}/.codex-plugin" "${adapterRoot}/skills"`,
    `printf '%s\\n' '{"name":"lazycodex","version":"0.1.0"}' > "${adapterRoot}/.codex-plugin/plugin.json"`,
    `printf '%s\\n' '{"mcpServers":{}}' > "${adapterRoot}/.mcp.json"`,
    "echo fake lazycodex install: $*",
  ].join("\n")
}

function runProcess(command: string, args: readonly string[], cwd: string, env?: NodeJS.ProcessEnv): Promise<ProcessResult> {
  return new Promise((resolve) => {
    execFile(command, [...args], { cwd, env: { ...process.env, ...env } }, (error, stdout, stderr) => {
      const exitCode = typeof error === "object" && error !== null && "code" in error && typeof error.code === "number" ? error.code : 0
      resolve({ exitCode, stdout, stderr })
    })
  })
}
