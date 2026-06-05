import { access, chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { execFile } from "node:child_process"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { runLfg, runLfgFromCwd, runLfgText } from "./test-process"

describe("lfg CLI", () => {
  test("package metadata exposes a single npx and bunx runnable lfg bin", async () => {
    const parsed = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")) as Record<string, unknown>
    expect(parsed.name).toBe("lfg")
    expect(parsed.description).toContain("npx")
    expect(parsed.description).toContain("bunx")
    expect(parsed.bin).toEqual({ lfg: "dist/lfg.js" })
    expect(parsed).not.toHaveProperty("exports")
    expect(JSON.stringify(parsed)).not.toContain("@lfg/plugin")
    expect(JSON.stringify(parsed)).not.toContain("runtime")
  })

  test("packed package excludes MCP output and exposes only the lfg bin", async () => {
    const files = await packDryRunFilePaths()

    expect(files).toContain("README.md")
    expect(files).toContain("dist/lfg.js")
    expect(files).toContain("dist/self-test.js")
    expect(files).toContain("dist/lfg.js.map")
    expect(files).toContain("dist/self-test.js.map")
    expect(files).not.toContain(".npmignore")
    expect(files).not.toContain("dist/lfg-mcp.js")
    expect(files).not.toContain("dist/lfg-mcp.js.map")
  })

  test("dry-setup returns non-mutating setup plan for package executors", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-home."))
    const result = await runLfg(["--json", "dry-setup"], { HOME: home })

    expect(result.exitCode).toBe(0)
    expect(result.json).toMatchObject({
      ok: true,
      status: "planned",
      command: "setup",
      dryRun: true,
      executed: false,
      installerCommand: "npx lazycodex-ai install",
      packageExecutors: ["npx lfg", "bunx lfg"],
      lfgIsPlugin: false,
    })
    expect(JSON.stringify(result.json)).not.toContain("config grok-byok")
    await expect(pathExists(join(home, ".grok", "config.toml"))).resolves.toBe(false)
  })

  test("setup plan is non-mutating until run is explicit", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-home."))
    const result = await runLfg(["--json", "setup"], { HOME: home })

    expect(result.exitCode).toBe(0)
    expect(result.json).toMatchObject({
      ok: true,
      status: "planned",
      command: "setup",
      dryRun: false,
      executed: false,
      installerCommand: "npx lazycodex-ai install",
    })
    expect(JSON.stringify(result.json)).not.toContain("config grok-byok")
    await expect(pathExists(join(home, ".grok", "config.toml"))).resolves.toBe(false)
  })

  test("setup run is the only explicit installer execution surface", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-home."))
    const fakeBin = await makeFakeNpx(0)
    const result = await runLfg(["--json", "setup", "--run"], { HOME: home, PATH: `${fakeBin}:${process.env.PATH ?? ""}` })

    expect(result.exitCode).toBe(0)
    expect(result.json).toMatchObject({
      ok: true,
      status: "installed",
      command: "setup",
      executed: true,
      installerCommand: "npx lazycodex-ai install",
      installerArgs: ["lazycodex-ai", "install"],
    })
    expect(JSON.stringify(result.json)).toContain("fake lazycodex install")
  })

  test("setup run resolves stable lazycodex adapter in post-install metadata", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-home."))
    const fakeBin = await makeFakeStableNpx()
    const adapterRoot = join(home, ".grok", "installed-plugins", "lazycodex")

    const result = await runLfg(["--json", "setup", "--run"], { HOME: home, PATH: `${fakeBin}:${process.env.PATH ?? ""}` })

    expect(result.exitCode).toBe(0)
    expect(result.json).toMatchObject({
      ok: true,
      status: "installed",
      stablePluginLink: {
        status: "linked",
        name: "lfg",
        targetPath: adapterRoot,
      },
      mcpConfigRepair: {
        path: join(adapterRoot, ".mcp.json"),
      },
    })
    expect(JSON.stringify(result.json)).not.toContain("missing_adapter")
  })

  test("setup run reports installer failure", async () => {
    const fakeBin = await makeFakeNpx(7)
    const result = await runLfg(["--json", "setup", "--run"], { PATH: `${fakeBin}:${process.env.PATH ?? ""}` })

    expect(result.exitCode).toBe(1)
    expect(result.json).toMatchObject({
      ok: false,
      status: "install_failed",
      command: "setup",
      executed: true,
      installerCommand: "npx lazycodex-ai install",
      exitCode: 7,
    })
    expect(JSON.stringify(result.json)).toContain("fake lazycodex failure")
  })

  test("interactive setup skips without unrelated configuration prompts", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-home."))
    const result = await runLfgText(["setup"], "n\ny\ny\n", { HOME: home })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("lfg setup")
    expect(result.stdout).toContain("npx lazycodex-ai install")
    expect(result.stdout).toContain("Install now?")
    expect(result.stdout).toContain("Skipped install")
    expect(result.stdout).not.toContain("Enable lazycodex in [plugins].enabled?")
    expect(result.stdout).not.toContain("Configure Grok BYOK now?")
    expect(result.stdout).not.toContain('"ok"')
    await expect(pathExists(join(home, ".grok", "config.toml"))).resolves.toBe(false)
  })

  test("doctor remains non-mutating and requires npx only", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-home."))
    const result = await runLfg(["--json", "doctor"], { HOME: home })

    expect(result.exitCode).toBe(0)
    expect(JSON.stringify(result.json)).toContain("exe:npx")
    expect(JSON.stringify(result.json)).not.toContain("exe:bun")
    await expect(pathExists(join(home, ".grok", "config.toml"))).resolves.toBe(false)
  })

  test("doctor resolves helper root when launched from package root", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-home."))
    const cwd = new URL("..", import.meta.url).pathname
    const result = await runLfgFromCwd(["--json", "doctor"], cwd, { HOME: home })

    expect(result.exitCode).toBe(0)
    expect(result.json).toMatchObject({
      ok: true,
      helperRoot: expect.stringMatching(/plugins\/lfg\/?$/),
    })
  })

  test("unsupported commands advertise only the narrowed plugin-installer surface", async () => {
    for (const legacy of [["--json", "install"], ["--json", "status"], ["--json", "config", "grok-byok"], ["--json", "lazycodex", "install"], ["--json", "setup", "install-plan"], ["--json", "setup", "show"], ["--json", "doctor", "state", "schema", "check"]] as const) {
      const result = await runLfg(legacy)
      expect(result.exitCode).toBe(1)
      expect(result.json).toMatchObject({
        ok: false,
        status: "error",
        code: "unsupported_command",
        supportedCommands: ["setup", "doctor", "dry-setup"],
      })
    }
  })

  test("help advertises only setup doctor and dry-setup", async () => {
    const result = await runLfgText(["help"], "", {})

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("lfg setup")
    expect(result.stdout).toContain("lfg dry-setup")
    expect(result.stdout).toContain("lfg doctor")
    expect(result.stdout).toContain("npx lfg")
    expect(result.stdout).toContain("bunx lfg")
    expect(result.stdout).not.toContain("config grok-byok")
    expect(result.stdout).not.toContain("lazycodex status")
  })
})

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch (error) {
    if (error instanceof Error) return false
    throw error
  }
}

async function packDryRunFilePaths(): Promise<readonly string[]> {
  const result = await execFileResult("npm", ["pack", "--workspace", "lfg", "--dry-run", "--json"])
  expect(result.exitCode).toBe(0)
  const parsed = JSON.parse(result.stdout) as readonly { readonly files?: readonly { readonly path?: string }[] }[]
  return parsed.flatMap((pack) => pack.files?.map((file) => file.path).filter((path): path is string => typeof path === "string") ?? [])
}

async function makeFakeNpx(exitCode: number): Promise<string> {
  const bin = await mkdtemp(join(tmpdir(), "lfg-fake-npx."))
  const body = exitCode === 0 ? await fakeInstallerScript() : "echo fake lazycodex failure: $* >&2"
  await writeFile(join(bin, "npx"), `#!/usr/bin/env bash\n${body}\nexit ${exitCode}\n`)
  await chmod(join(bin, "npx"), 0o755)
  return bin
}

async function makeFakeStableNpx(): Promise<string> {
  const bin = await mkdtemp(join(tmpdir(), "lfg-fake-npx."))
  const adapterRoot = join("$HOME", ".grok", "installed-plugins", "lazycodex")
  await writeFile(
    join(bin, "npx"),
    [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      `mkdir -p "${adapterRoot}/.codex-plugin" "${adapterRoot}/skills"`,
      `printf '%s\\n' '{"name":"lazycodex","version":"0.1.0"}' > "${adapterRoot}/.codex-plugin/plugin.json"`,
      `printf '%s\\n' '{"mcpServers":{}}' > "${adapterRoot}/.mcp.json"`,
      'echo fake stable lazycodex install: "$@"',
      "",
    ].join("\n"),
  )
  await chmod(join(bin, "npx"), 0o755)
  return bin
}

function execFileResult(file: string, args: readonly string[]): Promise<{ readonly exitCode: number; readonly stdout: string }> {
  return new Promise((resolve) => {
    execFile(file, [...args], (error, stdout) => {
      const exitCode = typeof error === "object" && error !== null && "code" in error && typeof error.code === "number" ? error.code : 0
      resolve({ exitCode, stdout })
    })
  })
}

async function fakeInstallerScript(): Promise<string> {
  const adapterRoot = join("$HOME", ".grok", "installed-plugins", "0-1-0-ff47fdd7")
  return [
    `mkdir -p "${adapterRoot}/.codex-plugin" "${adapterRoot}/skills"`,
    `printf '%s\\n' '{"name":"lazycodex","version":"0.1.0"}' > "${adapterRoot}/.codex-plugin/plugin.json"`,
    `printf '%s\\n' '{"mcpServers":{}}' > "${adapterRoot}/.mcp.json"`,
    "echo fake lazycodex install: $*",
  ].join("\n")
}
