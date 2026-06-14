import { access, cp, mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"

const MCP_RUNTIME_DIRS = ["ast-grep-mcp", "lsp-daemon", "git-bash-mcp"] as const

function pluginMcpJson(pluginRoot: string): object {
  return {
    mcpServers: {
      ast_grep: {
        command: "node",
        args: [join(pluginRoot, "mcp-runtimes", "ast-grep-mcp", "dist", "cli.js"), "mcp"],
        cwd: pluginRoot,
      },
      grep_app: {
        url: "https://mcp.grep.app",
      },
      context7: {
        url: "https://mcp.context7.com/mcp",
      },
      git_bash: {
        command: "node",
        args: [join(pluginRoot, "mcp-runtimes", "git-bash-mcp", "dist", "cli.js"), "mcp"],
        cwd: pluginRoot,
      },
      lsp: {
        command: "node",
        args: [join(pluginRoot, "mcp-runtimes", "lsp-daemon", "dist", "cli.js"), "mcp"],
        cwd: pluginRoot,
      },
    },
  }
}

/** Copy lazycodex MCP package dist trees into the plugin and write Grok-relative .mcp.json. */
export async function materializeGrokMcpRuntimes(
  pluginRoot: string,
  sourceRoot: string,
): Promise<{ ok: boolean; runtimesRoot: string | null }> {
  const runtimesRoot = await resolveMcpPackagesRoot(sourceRoot)
  if (runtimesRoot === null) {
    return { ok: false, runtimesRoot: null }
  }

  const destRoot = join(pluginRoot, "mcp-runtimes")
  await mkdir(destRoot, { recursive: true })

  for (const dir of MCP_RUNTIME_DIRS) {
    const src = join(runtimesRoot, dir)
    const cli = join(src, "dist", "cli.js")
    if (!(await pathExists(cli))) continue
    await cp(src, join(destRoot, dir), { recursive: true, force: true })
  }

  const astCli = join(destRoot, "ast-grep-mcp", "dist", "cli.js")
  const lspCli = join(destRoot, "lsp-daemon", "dist", "cli.js")
  if (!(await pathExists(astCli)) || !(await pathExists(lspCli))) {
    return { ok: false, runtimesRoot }
  }

  await writeFile(join(pluginRoot, ".mcp.json"), `${JSON.stringify(pluginMcpJson(pluginRoot), null, "\t")}\n`, "utf8")
  return { ok: true, runtimesRoot }
}

export async function resolveMcpPackagesRoot(sourceRoot: string): Promise<string | null> {
  const candidates: string[] = []
  let dir = sourceRoot
  for (let i = 0; i < 6; i++) {
    candidates.push(dir)
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }

  for (const root of candidates) {
    const ast = join(root, "ast-grep-mcp", "dist", "cli.js")
    const lsp = join(root, "lsp-daemon", "dist", "cli.js")
    if ((await pathExists(ast)) && (await pathExists(lsp))) {
      return root
    }
  }
  return null
}

export async function readPluginMcpJson(pluginRoot: string): Promise<unknown> {
  const raw = await readFile(join(pluginRoot, ".mcp.json"), "utf8")
  return JSON.parse(raw) as unknown
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}