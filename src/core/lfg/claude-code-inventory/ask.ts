import { spawn } from "node:child_process"
import { resolveClaudeBinary } from "./bridge"
import type { ClaudeCodeInventoryOptions } from "./types"

export type ClaudeAskResult = {
  readonly ok: boolean
  readonly status: "claude_ask_ok" | "claude_ask_failed" | "claude_cli_missing"
  readonly claudeBinary: string | null
  readonly exitCode: number | null
  readonly stdout: string
  readonly stderr: string
  readonly promptPreview: string
  readonly durationMs: number
}

/**
 * Run Claude Code headless (`claude -p`) for a one-shot reply.
 * Does not auto-approve dangerous tools; caller can pass extraArgs.
 */
export async function askClaudeCode(
  prompt: string,
  options: {
    readonly cwd?: string
    readonly timeoutMs?: number
    readonly extraArgs?: readonly string[]
  } & ClaudeCodeInventoryOptions = {},
): Promise<ClaudeAskResult> {
  const text = prompt.trim()
  const claudeBinary = resolveClaudeBinary(options)
  const promptPreview = text.length > 200 ? `${text.slice(0, 199)}…` : text
  if (claudeBinary === null) {
    return {
      ok: false,
      status: "claude_cli_missing",
      claudeBinary: null,
      exitCode: null,
      stdout: "",
      stderr: "Claude Code CLI not found. Install `claude` or set CLAUDE_CLI.",
      promptPreview,
      durationMs: 0,
    }
  }
  if (text.length === 0) {
    return {
      ok: false,
      status: "claude_ask_failed",
      claudeBinary,
      exitCode: null,
      stdout: "",
      stderr: "empty prompt",
      promptPreview: "",
      durationMs: 0,
    }
  }

  const args = ["-p", text, "--output-format", "text", ...(options.extraArgs ?? [])]
  const started = Date.now()
  return await new Promise<ClaudeAskResult>((resolve) => {
    const child = spawn(claudeBinary, args, {
      cwd: options.cwd ?? process.cwd(),
      env: { ...process.env, ...(options.env ?? {}) },
      stdio: ["ignore", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    const timeoutMs = options.timeoutMs ?? 120_000
    const timer = setTimeout(() => {
      child.kill("SIGTERM")
      setTimeout(() => child.kill("SIGKILL"), 2_000).unref?.()
    }, timeoutMs)
    child.stdout?.setEncoding("utf8")
    child.stderr?.setEncoding("utf8")
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk
      if (stdout.length > 500_000) stdout = `${stdout.slice(0, 500_000)}\n…[truncated]`
    })
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk
      if (stderr.length > 100_000) stderr = `${stderr.slice(0, 100_000)}\n…[truncated]`
    })
    child.on("error", (error) => {
      clearTimeout(timer)
      resolve({
        ok: false,
        status: "claude_ask_failed",
        claudeBinary,
        exitCode: null,
        stdout,
        stderr: error instanceof Error ? error.message : String(error),
        promptPreview,
        durationMs: Date.now() - started,
      })
    })
    child.on("close", (code) => {
      clearTimeout(timer)
      const exitCode = code ?? 1
      resolve({
        ok: exitCode === 0,
        status: exitCode === 0 ? "claude_ask_ok" : "claude_ask_failed",
        claudeBinary,
        exitCode,
        stdout: stdout.trimEnd(),
        stderr: stderr.trimEnd(),
        promptPreview,
        durationMs: Date.now() - started,
      })
    })
  })
}
