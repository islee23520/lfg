import { spawn } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))

export const LFG = join(here, "..", "dist", "lfg.js")
export const MCP = join(here, "..", "dist", "lfg-mcp.js")

export type ProcessResult = {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}

export async function runNodeScript(script: string, args: readonly string[], input: string | null, env: Readonly<Record<string, string>> = {}): Promise<ProcessResult> {
  const child = spawn(process.execPath, [script, ...args], {
    env: { ...process.env, ...env },
    stdio: ["pipe", "pipe", "pipe"],
  })
  child.stdin.end(input ?? undefined)
  const [stdout, stderr, exitCode] = await Promise.all([streamText(child.stdout), streamText(child.stderr), exitCodeOf(child)])
  return { exitCode, stdout, stderr }
}

export async function runLfg(args: readonly string[], env: Readonly<Record<string, string>> = {}): Promise<{ readonly exitCode: number; readonly json: unknown }> {
  const result = await runNodeScript(LFG, args, null, env)
  return { exitCode: result.exitCode, json: JSON.parse(result.stdout) as unknown }
}

export async function runLfgText(args: readonly string[], input: string, env: Readonly<Record<string, string>> = {}): Promise<ProcessResult> {
  return runNodeScript(LFG, args, input, env)
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
