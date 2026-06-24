import { spawn } from "node:child_process"
import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect } from "vitest"

export async function createMcpPackageFixture(skip: readonly string[] = []): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "lfg-mcp-src-"))
  for (const dir of ["ast-grep-mcp", "lsp-daemon", "git-bash-mcp"] as const) {
    if (skip.includes(dir)) continue
    const cli = join(root, dir, "dist", "cli.js")
    await mkdir(join(root, dir, "dist"), { recursive: true })
    await writeFile(cli, "#!/usr/bin/env node\n", "utf8")
  }
  await mkdir(join(root, "omo-codex", "plugin"), { recursive: true })
  return root
}

export async function createComponentShimFixture(packageRoot: string): Promise<void> {
  for (const dir of ["ast-grep", "git-bash", "lsp"] as const) {
    const cli = join(packageRoot, "components", dir, "dist", "cli.js")
    await mkdir(join(packageRoot, "components", dir, "dist"), { recursive: true })
    await writeFile(cli, "#!/usr/bin/env node\n", "utf8")
  }
}

export async function createRuntimePackage(packageRoot: string, runtimeDir: string, serverName: string): Promise<void> {
  const cli = join(packageRoot, "packages", runtimeDir, "dist", "cli.js")
  await mkdir(join(packageRoot, "packages", runtimeDir, "dist"), { recursive: true })
  await writeFile(cli, `#!/usr/bin/env node\n// upstream-${serverName}\n`, "utf8")
}

type McpProbeResult = {
  readonly stderr: string
  readonly messages: readonly unknown[]
}

export async function runMcpProbe(cli: string): Promise<McpProbeResult> {
  const child = spawn(process.execPath, [cli, "mcp"], { stdio: ["pipe", "pipe", "pipe"] })
  let stdout = ""
  let stderr = ""
  child.stdout.setEncoding("utf8")
  child.stderr.setEncoding("utf8")
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk
  })
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk
  })
  child.stdin.end(
    [
      { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
      { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
    ]
      .map((message) => JSON.stringify(message))
      .join("\n") + "\n",
  )
  const status = await new Promise<number | null>((resolve) => {
    child.on("exit", (code) => resolve(code))
  })
  expect(status, stderr).toBe(0)
  return {
    stderr,
    messages: stdout
      .trim()
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as unknown),
  }
}
