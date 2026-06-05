import { describe, expect, test } from "vitest"
import { chmod, lstat, mkdir, mkdtemp, readFile, readlink, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runLfg, runLfgText } from "./test-process"
const HASH_PLUGIN_ID = "0-1-0-ff47fdd7"

describe("lfg stable Grok installed-plugin name", () => {
  test("links installed lazycodex adapter under both stable installed-plugin names", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-home."))
    const fakeBin = await makeFakeNpx({ createAdapter: true })
    const target = join(home, ".grok", "installed-plugins", HASH_PLUGIN_ID)
    const lfgLink = join(home, ".grok", "installed-plugins", "lfg")
    const lazycodexLink = join(home, ".grok", "installed-plugins", "lazycodex")

    const result = await runLfg(["--json", "setup", "--run"], { HOME: home, PATH: `${fakeBin}:${process.env.PATH ?? ""}` })

    expect(result.exitCode).toBe(0)
    expect(result.json).toMatchObject({
      ok: true,
      status: "installed",
      stablePluginLinks: [
        { status: "linked", name: "lfg", linkPath: lfgLink, targetPath: target },
        { status: "linked", name: "lazycodex", linkPath: lazycodexLink, targetPath: target },
      ],
    })
    expect(await readlink(lfgLink)).toBe(target)
    expect(await readlink(lazycodexLink)).toBe(target)
  })

  test("links installed lazycodex adapter under stable lfg plugin name", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-home."))
    const fakeBin = await makeFakeNpx({ createAdapter: true })
    const target = join(home, ".grok", "installed-plugins", HASH_PLUGIN_ID)
    const link = join(home, ".grok", "installed-plugins", "lfg")

    const result = await runLfg(["--json", "setup", "--run"], { HOME: home, PATH: `${fakeBin}:${process.env.PATH ?? ""}` })

    expect(result.exitCode).toBe(0)
    expect(result.json).toMatchObject({
      ok: true,
      status: "installed",
      stablePluginLink: {
        status: "linked",
        name: "lfg",
        linkPath: link,
        targetPath: target,
      },
    })
    expect(await readlink(link)).toBe(target)
  })

  test("refreshes stale lfg installed-plugin symlink after install", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-home."))
    const oldTarget = await makeAdapterRoot(join(home, ".grok", "installed-plugins", "old-lfg"))
    const link = join(home, ".grok", "installed-plugins", "lfg")
    await symlink(oldTarget, link)
    const fakeBin = await makeFakeNpx({ createAdapter: true })
    const newTarget = join(home, ".grok", "installed-plugins", HASH_PLUGIN_ID)

    const result = await runLfg(["--json", "setup", "--run"], { HOME: home, PATH: `${fakeBin}:${process.env.PATH ?? ""}` })

    expect(result.exitCode).toBe(0)
    expect(result.json).toMatchObject({ stablePluginLink: { status: "linked", targetPath: newTarget } })
    expect(await readlink(link)).toBe(newTarget)
  })

  test("reports skipped stable lfg link when installed adapter cannot be found", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-home."))
    const fakeBin = await makeFakeNpx({ createAdapter: false })

    const result = await runLfg(["--json", "setup", "--run"], { HOME: home, PATH: `${fakeBin}:${process.env.PATH ?? ""}` })

    expect(result.exitCode).toBe(0)
    expect(result.json).toMatchObject({
      ok: true,
      status: "installed",
      stablePluginLink: {
        status: "missing_adapter",
        name: "lfg",
        linkPath: join(home, ".grok", "installed-plugins", "lfg"),
      },
    })
  })

  test("prefers stable lfg installed-plugin symlink in status", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-home."))
    const target = await makeAdapterRoot(join(home, ".grok", "installed-plugins", HASH_PLUGIN_ID))
    const link = join(home, ".grok", "installed-plugins", "lfg")
    await symlink(target, link)

    const result = await runLfg(["--json", "dry-setup"], { HOME: home })

    expect(result.exitCode).toBe(0)
    expect(result.json).toMatchObject({
      adapter: {
        found: true,
        root: link,
        manifest: join(link, ".codex-plugin", "plugin.json"),
      },
    })
  })

  test("prefers stable lazycodex installed-plugin symlink in status", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-home."))
    const target = await makeAdapterRoot(join(home, ".grok", "installed-plugins", HASH_PLUGIN_ID))
    const link = join(home, ".grok", "installed-plugins", "lazycodex")
    await symlink(target, link)

    const result = await runLfg(["--json", "dry-setup"], { HOME: home })

    expect(result.exitCode).toBe(0)
    expect(result.json).toMatchObject({
      adapter: {
        found: true,
        root: link,
        manifest: join(link, ".codex-plugin", "plugin.json"),
      },
    })
  })

  test("refuses to replace non-symlink lfg installed-plugin entry", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-home."))
    const link = await makeAdapterRoot(join(home, ".grok", "installed-plugins", "lfg"))
    const fakeBin = await makeFakeNpx({ createAdapter: true })

    const result = await runLfg(["--json", "setup", "--run"], { HOME: home, PATH: `${fakeBin}:${process.env.PATH ?? ""}` })

    expect(result.exitCode).toBe(0)
    expect(result.json).toMatchObject({
      ok: true,
      status: "installed",
      stablePluginLink: {
        status: "conflict",
        name: "lfg",
        linkPath: link,
      },
    })
    expect((await lstat(link)).isDirectory()).toBe(true)
  })

  test("reports non-symlink lazycodex conflict without failing install", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-home."))
    const link = await makeAdapterRoot(join(home, ".grok", "installed-plugins", "lazycodex"))
    const fakeBin = await makeFakeNpx({ createAdapter: true })

    const result = await runLfg(["--json", "setup", "--run"], { HOME: home, PATH: `${fakeBin}:${process.env.PATH ?? ""}` })

    expect(result.exitCode).toBe(0)
    expect(result.json).toMatchObject({
      ok: true,
      status: "installed",
      stablePluginLinks: expect.arrayContaining([
        expect.objectContaining({
          status: "conflict",
          name: "lazycodex",
          linkPath: link,
        }),
      ]),
    })
    expect((await lstat(link)).isDirectory()).toBe(true)
  })

  test("ignores broken stable lfg symlink in status", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-home."))
    const hashTarget = await makeAdapterRoot(join(home, ".grok", "installed-plugins", HASH_PLUGIN_ID))
    const link = join(home, ".grok", "installed-plugins", "lfg")
    await symlink(join(home, ".grok", "installed-plugins", "missing-target"), link)

    const result = await runLfg(["--json", "dry-setup"], { HOME: home })

    expect(result.exitCode).toBe(0)
    expect(result.json).toMatchObject({ adapter: { found: true, root: hashTarget } })
    expect(await readlink(link)).toContain("missing-target")
  })

  test("keeps explicit adapter root ahead of stable lfg installed-plugin status", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-home."))
    const explicit = await makeAdapterRoot(join(home, "explicit-adapter"))
    const stableTarget = await makeAdapterRoot(join(home, ".grok", "installed-plugins", HASH_PLUGIN_ID))
    await symlink(stableTarget, join(home, ".grok", "installed-plugins", "lfg"))

    const result = await runLfg(["--json", "dry-setup"], { HOME: home, LAZYCODEX_ADAPTER_ROOT: explicit })

    expect(result.exitCode).toBe(0)
    expect(result.json).toMatchObject({ adapter: { found: true, root: explicit } })
  })

  test("links post-install stable lfg name to hash adapter when primary adapter also exists", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-home."))
    await makeAdapterRoot(join(home, ".grok", "plugins", "lazycodex"))
    const fakeBin = await makeFakeNpx({ createAdapter: true })
    const hashTarget = join(home, ".grok", "installed-plugins", HASH_PLUGIN_ID)

    const result = await runLfg(["--json", "setup", "--run"], { HOME: home, PATH: `${fakeBin}:${process.env.PATH ?? ""}` })

    expect(result.exitCode).toBe(0)
    expect(result.json).toMatchObject({ stablePluginLink: { status: "linked", targetPath: hashTarget } })
    expect(await readlink(join(home, ".grok", "installed-plugins", "lfg"))).toBe(hashTarget)
  })

  test("repairs installed lazycodex mcp server paths after install", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-home."))
    const fakeBin = await makeFakeNpx({ createAdapter: true, staleMcpConfig: true, createMcpComponents: true })
    const adapterRoot = join(home, ".grok", "installed-plugins", HASH_PLUGIN_ID)

    const result = await runLfg(["--json", "setup", "--run"], { HOME: home, PATH: `${fakeBin}:${process.env.PATH ?? ""}` })

    expect(result.exitCode).toBe(0)
    expect(result.json).toMatchObject({
      ok: true,
      status: "installed",
      mcpConfigRepair: {
        status: "repaired",
        path: join(adapterRoot, ".mcp.json"),
        servers: ["ast_grep", "lsp"],
      },
    })
    const mcpConfig = JSON.parse(await readFile(join(adapterRoot, ".mcp.json"), "utf8"))
    expect(mcpConfig).toMatchObject({
      mcpServers: {
        ast_grep: {
          command: "node",
          args: [join(adapterRoot, "components", "ast-grep-mcp", "dist", "cli.js"), "mcp"],
        },
        lsp: {
          command: "node",
          args: [join(adapterRoot, "components", "lsp-tools-mcp", "dist", "cli.js"), "mcp"],
        },
      },
    })
  })

  test("keeps install successful when mcp repair cannot find components", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-home."))
    const fakeBin = await makeFakeNpx({ createAdapter: true, staleMcpConfig: true, createMcpComponents: false })

    const result = await runLfg(["--json", "setup", "--run"], { HOME: home, PATH: `${fakeBin}:${process.env.PATH ?? ""}` })

    expect(result.exitCode).toBe(0)
    expect(result.json).toMatchObject({
      ok: true,
      status: "installed",
      mcpConfigRepair: {
        status: "missing_components",
        missing: ["ast_grep", "lsp"],
      },
    })
  })

  test("interactive install reports stable lfg installed-plugin name", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-home."))
    const fakeBin = await makeFakeNpx({ createAdapter: true })

    const result = await runLfgText(["setup"], "y\nn\n", { HOME: home, PATH: `${fakeBin}:${process.env.PATH ?? ""}` })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("Registered Grok installed-plugin name: lfg")
    expect(result.stdout).toContain("Registered Grok installed-plugin name: lazycodex")
    expect(result.stdout).toContain(join(home, ".grok", "installed-plugins", "lfg"))
    expect(result.stdout).toContain(join(home, ".grok", "installed-plugins", "lazycodex"))
  })
})

async function makeAdapterRoot(root: string): Promise<string> {
  await mkdir(join(root, ".codex-plugin"), { recursive: true })
  await mkdir(join(root, "skills"), { recursive: true })
  await writeFile(join(root, ".codex-plugin", "plugin.json"), `${JSON.stringify({ name: "lazycodex", version: "0.1.0" })}\n`)
  await writeFile(join(root, ".mcp.json"), `${JSON.stringify({ mcpServers: {} })}\n`)
  return root
}

async function makeFakeNpx(options: { readonly createAdapter: boolean; readonly staleMcpConfig?: boolean; readonly createMcpComponents?: boolean }): Promise<string> {
  const bin = await mkdtemp(join(tmpdir(), "lfg-fake-npx."))
  const mcpConfig = options.staleMcpConfig === true ? '{"mcpServers":{"ast_grep":{"command":"node","args":["/old/cache/ast-grep-mcp/dist/cli.js","mcp"]},"lsp":{"command":"node","args":["/old/cache/lsp-tools-mcp/dist/cli.js","mcp"]}}}' : '{"mcpServers":{}}'
  const componentSetup = options.createMcpComponents === true ? 'mkdir -p "$target/components/ast-grep-mcp/dist" "$target/components/lsp-tools-mcp/dist"\nprintf "%s\\n" "#!/usr/bin/env node" > "$target/components/ast-grep-mcp/dist/cli.js"\nprintf "%s\\n" "#!/usr/bin/env node" > "$target/components/lsp-tools-mcp/dist/cli.js"' : "true"
  const createAdapter = options.createAdapter
    ? [
        `target="$HOME/.grok/installed-plugins/${HASH_PLUGIN_ID}"`,
        'mkdir -p "$target/.codex-plugin" "$target/skills"',
        componentSetup,
        `printf '%s\\n' '{"name":"lazycodex","version":"0.1.0"}' > "$target/.codex-plugin/plugin.json"`,
        `printf '%s\\n' '${mcpConfig}' > "$target/.mcp.json"`,
      ].join("\n")
    : "true"
  await writeFile(join(bin, "npx"), `#!/usr/bin/env bash\nset -euo pipefail\n${createAdapter}\necho fake lazycodex install: "$@"\n`)
  await chmod(join(bin, "npx"), 0o755)
  return bin
}
