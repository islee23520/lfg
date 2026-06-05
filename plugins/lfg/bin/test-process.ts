import { spawn } from "node:child_process"
import { access } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, "..", "..", "..")

export const LFG = join(here, "..", "dist", "lfg.js")

let buildPromise: Promise<void> | null = null

export type ProcessResult = {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}

export async function runNodeScript(script: string, args: readonly string[], input: string | null, env: Readonly<Record<string, string>> = {}, cwd = process.cwd()): Promise<ProcessResult> {
  await ensureBuilt(script)
  const child = spawn(process.execPath, [script, ...args], {
    cwd,
    env: { ...process.env, ...env },
    stdio: ["pipe", "pipe", "pipe"],
  })
  child.stdin.end(input ?? undefined)
  const [stdout, stderr, exitCode] = await Promise.all([streamText(child.stdout), streamText(child.stderr), exitCodeOf(child)])
  return { exitCode, stdout, stderr }
}

async function ensureBuilt(script: string): Promise<void> {
  if (!script.startsWith(join(here, "..", "dist"))) {
    return
  }

  try {
    await access(script)
    return
  } catch (error) {
    if (!(error instanceof Error)) {
      throw error
    }
  }

  buildPromise ??= runBuild()
  await buildPromise
}

async function runBuild(): Promise<void> {
  const result = await runProcess(process.execPath, [join(root, "scripts", "build.mjs")], null)
  if (result.exitCode !== 0) {
    throw new BuildError(result)
  }
}

async function runProcess(command: string, args: readonly string[], input: string | null): Promise<ProcessResult> {
  const child = spawn(command, args, {
    cwd: root,
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"],
  })
  child.stdin.end(input ?? undefined)
  const [stdout, stderr, exitCode] = await Promise.all([streamText(child.stdout), streamText(child.stderr), exitCodeOf(child)])
  return { exitCode, stdout, stderr }
}

class BuildError extends Error {
  constructor(readonly result: ProcessResult) {
    super(`lfg test build failed with exit code ${result.exitCode}`)
  }
}

export async function runLfg(args: readonly string[], env: Readonly<Record<string, string>> = {}): Promise<{ readonly exitCode: number; readonly json: unknown }> {
  const result = await runNodeScript(LFG, args, null, env)
  return { exitCode: result.exitCode, json: JSON.parse(result.stdout) as unknown }
}

export async function runLfgText(args: readonly string[], input: string, env: Readonly<Record<string, string>> = {}): Promise<ProcessResult> {
  return runNodeScript(LFG, args, input, env)
}

export async function runLfgFromCwd(args: readonly string[], cwd: string, env: Readonly<Record<string, string>> = {}): Promise<{ readonly exitCode: number; readonly json: unknown }> {
  const result = await runNodeScript(LFG, args, null, env, cwd)
  return { exitCode: result.exitCode, json: JSON.parse(result.stdout) as unknown }
}

function streamText(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    stream.on("data", (chunk: Buffer) => chunks.push(chunk))
    stream.on("error", reject)
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")))
  })
}

function exitCodeOf(child: ReturnType<typeof spawn>): Promise<number> {
  return new Promise((resolve) => {
    child.on("close", (code) => resolve(code ?? 1))
  })
}
