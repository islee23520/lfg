import { execFile } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

export const LFG_GLOBAL_INSTALL_SPEC = "@islee23520/lfg@latest" as const

export type LfgGlobalInstallResult = {
  readonly ok: boolean
  readonly command: string
  readonly args: readonly string[]
  readonly stdout: string
  readonly stderr: string
  readonly error?: string
}

export async function installLfgGlobally(): Promise<LfgGlobalInstallResult> {
  const command = process.platform === "win32" ? "npm.cmd" : "npm"
  const args = ["install", "--global", LFG_GLOBAL_INSTALL_SPEC] as const
  try {
    const result = await execFileAsync(command, [...args], {
      encoding: "utf8",
      timeout: 120_000,
      maxBuffer: 1024 * 1024,
    })
    return { ok: true, command, args, stdout: result.stdout, stderr: result.stderr }
  } catch (error) {
    const failure = normalizeExecFailure(error)
    return { ok: false, command, args, stdout: failure.stdout, stderr: failure.stderr, error: failure.message }
  }
}

function normalizeExecFailure(error: unknown): { readonly message: string; readonly stdout: string; readonly stderr: string } {
  if (error instanceof Error) {
    const withOutput = error as Error & { readonly stdout?: unknown; readonly stderr?: unknown }
    return {
      message: error.message,
      stdout: typeof withOutput.stdout === "string" ? withOutput.stdout : "",
      stderr: typeof withOutput.stderr === "string" ? withOutput.stderr : "",
    }
  }
  return { message: String(error), stdout: "", stderr: "" }
}
