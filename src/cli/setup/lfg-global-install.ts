import { execFile } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

type GlobalInstallRunner = (
  command: string,
  args: readonly string[],
  cwd: string,
) => Promise<{ readonly stdout: string; readonly stderr: string }>

export type InstallLfgGloballyOptions = {
  readonly packageRoot?: string
  readonly runner?: GlobalInstallRunner
}

export type LfgGlobalInstallResult = {
  readonly ok: boolean
  readonly command: string
  readonly args: readonly string[]
  readonly stdout: string
  readonly stderr: string
  readonly error?: string
}

export async function installLfgGlobally(options: InstallLfgGloballyOptions = {}): Promise<LfgGlobalInstallResult> {
  const command = process.platform === "win32" ? "npm.cmd" : "npm"
  const packageRoot = options.packageRoot ?? resolve(dirname(process.argv[1] ?? process.cwd()), "..")
  const runner = options.runner ?? runNpm
  const packRoot = await mkdtemp(join(tmpdir(), "lfg-global-install-"))
  let args: readonly string[] = ["install", "--global", packageRoot]
  try {
    const packed = await runner(command, ["pack", "--pack-destination", packRoot, "--silent"], packageRoot)
    const tarballName = packed.stdout.trim().split(/\r?\n/).at(-1)
    if (tarballName === undefined || tarballName.length === 0) {
      throw new Error("npm pack did not report a tarball filename")
    }
    const tarballPath = join(packRoot, tarballName)
    args = ["install", "--global", tarballPath]
    const result = await runner(command, args, packageRoot)
    return { ok: true, command, args, stdout: result.stdout, stderr: result.stderr }
  } catch (error) {
    const failure = normalizeExecFailure(error)
    return { ok: false, command, args, stdout: failure.stdout, stderr: failure.stderr, error: failure.message }
  } finally {
    await rm(packRoot, { recursive: true, force: true })
  }
}

async function runNpm(command: string, args: readonly string[], cwd: string): Promise<{ readonly stdout: string; readonly stderr: string }> {
  return execFileAsync(command, [...args], {
    cwd,
    encoding: "utf8",
    timeout: 120_000,
    maxBuffer: 1024 * 1024,
  })
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
