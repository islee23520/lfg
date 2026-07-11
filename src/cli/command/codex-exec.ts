import { spawn } from "node:child_process"
import type { JsonObject } from "../../shared/json"

const CODEX_COMMAND = "codex" as const
const CODEX_EXEC_ARGS = ["exec", "--cd"] as const
const CODEX_SANDBOX_ARGS = ["--sandbox", "workspace-write"] as const

export type CodexExecPlan = JsonObject & {
  readonly ok: true
  readonly status: "planned"
  readonly command: "codex_exec"
  readonly executed: false
  readonly argv: readonly string[]
}

export type CodexExecResult = JsonObject & {
  readonly ok: boolean
  readonly status: "completed" | "command_unavailable" | "failed"
  readonly command: "codex_exec"
  readonly executed: true
  readonly exitCode: number
  readonly argv: readonly string[]
  readonly error?: string
}

export function codexExecPlan(task: string, workspace: string): CodexExecPlan {
  return {
    ok: true,
    status: "planned",
    command: "codex_exec",
    executed: false,
    argv: codexExecArgv(task, workspace),
  }
}

export function runCodexExec(
  task: string,
  workspace: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<CodexExecResult> {
  const argv = codexExecArgv(task, workspace)
  const [, ...args] = argv
  return new Promise((resolve) => {
    const child = spawn(CODEX_COMMAND, args, { cwd: workspace, env, stdio: "inherit" })
    child.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        resolve({
          ok: false,
          status: "command_unavailable",
          command: "codex_exec",
          executed: true,
          exitCode: 127,
          argv,
          error: 'Cannot run Codex: command "codex" was not found on PATH.',
        })
        return
      }
      resolve({
        ok: false,
        status: "failed",
        command: "codex_exec",
        executed: true,
        exitCode: 1,
        argv,
        error: `Codex could not start: ${error.message}`,
      })
    })
    child.on("close", (code) => {
      const exitCode = code ?? 1
      resolve({
        ok: exitCode === 0,
        status: exitCode === 0 ? "completed" : "failed",
        command: "codex_exec",
        executed: true,
        exitCode,
        argv,
        ...(exitCode === 0 ? {} : { error: `Codex exited with code ${exitCode}.` }),
      })
    })
  })
}

function codexExecArgv(task: string, workspace: string): readonly string[] {
  return [CODEX_COMMAND, ...CODEX_EXEC_ARGS, workspace, ...CODEX_SANDBOX_ARGS, task]
}
