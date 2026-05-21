export type LfgRunResult = { exitCode: number; stdout: string; stderr: string; json: unknown | null }

export async function runLfgTs(entrypoint: string, args: string[] = [], env: NodeJS.ProcessEnv = process.env): Promise<LfgRunResult> {
  const proc = Bun.spawn(["bun", "--bun", entrypoint, ...args], { env, stdout: "pipe", stderr: "pipe" })
  const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited])
  return { exitCode, stdout, stderr, json: parseJson(stdout) }
}

function parseJson(text: string): unknown | null {
  try { return JSON.parse(text) } catch { return null }
}
