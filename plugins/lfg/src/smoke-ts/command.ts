import { spawnSync } from "node:child_process"
import type { CommandResult } from "./types"

export function runCommand(
  argv: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv; input?: string; timeoutMs?: number; forwardOutput?: boolean },
): CommandResult {
  const result = spawnSync(argv[0] ?? "", argv.slice(1), {
    cwd: options.cwd,
    env: options.env,
    input: options.input,
    encoding: "utf8",
    timeout: options.timeoutMs ?? 120_000,
  })
  const stdout = result.stdout ?? ""
  const stderr = result.stderr ?? ""
  if (result.error) throw result.error
  if (result.status !== 0) {
    if (stdout) process.stdout.write(stdout)
    if (stderr) process.stderr.write(stderr)
    throw new Error(`${argv.join(" ")} exited with ${result.status ?? "signal"}`)
  }
  if (options.forwardOutput !== false) {
    if (stdout) process.stdout.write(stdout)
    if (stderr) process.stderr.write(stderr)
  }
  return { stdout, stderr, status: result.status }
}

export function parseJson<T>(text: string, label: string): T {
  try {
    return JSON.parse(text) as T
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${label}: invalid JSON: ${message}`)
  }
}
