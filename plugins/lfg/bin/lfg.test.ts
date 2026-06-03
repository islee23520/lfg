import { describe, expect, test } from "bun:test"
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

const LFG = new URL("lfg", import.meta.url).pathname

describe("lfg CLI", () => {
  test("package metadata does not identify lfg as a plugin", async () => {
    const parsed = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")) as Record<string, unknown>
    expect(parsed.name).toBe("@lfg/lazycodex-adapter-installer")
    expect(parsed.description).toBe("Installs the lazycodex Codex adapter for grok-build.")
    expect(JSON.stringify(parsed)).not.toContain("@lfg/plugin")
    expect(JSON.stringify(parsed)).not.toContain("plugin postinstall")
  })

  test("reports lazycodex adapter install command and target", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-home."))
    const result = await runLfg(["--json", "install"], { HOME: home })
    expect(result.exitCode).toBe(0)
    expect(result.json).toMatchObject({
      ok: true,
      status: "planned",
      role: "lazycodex_adapter_installer",
      adapterPackage: "lazycodex-ai",
      installerCommand: "npx lazycodex-ai install",
      executed: false,
      grokBuildUse: true,
      lfgIsPlugin: false,
      grokSurfaces: {
        customModelConfig: expect.stringContaining(join(".grok", "config.toml")),
        globalAgentRoot: expect.stringContaining(join(".grok", "agents")),
        projectAgentRoot: expect.stringContaining(join(".grok", "agents")),
        acpCommand: "grok agent stdio",
        globalPluginRoot: expect.stringContaining(join(".grok", "plugins")),
        projectPluginRoot: expect.stringContaining(join(".grok", "plugins")),
        userMcpConfig: expect.stringContaining(join(".grok", "config.toml")),
        projectMcpConfig: expect.stringContaining(join(".grok", "config.toml")),
        projectRootMcpConfig: expect.stringContaining(".mcp.json"),
      },
      verificationCommands: expect.arrayContaining(["grok models", "grok inspect --json", "grok plugin list --json"]),
    })
    expect(JSON.stringify(result.json)).not.toContain("installed-plugins/0-1-0-ff47fdd7")
    expect(JSON.stringify(result.json)).not.toContain("Grok plugin")
    expect(JSON.stringify(result.json)).not.toContain("grok_plugin")
  })

  test("keeps lazycodex install as a compatibility alias", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-home."))
    const result = await runLfg(["--json", "lazycodex", "install"], { HOME: home })

    expect(result.exitCode).toBe(0)
    expect(result.json).toMatchObject({
      ok: true,
      status: "planned",
      installerCommand: "npx lazycodex-ai install",
      executed: false,
    })
  })

  test("shows an interactive install wizard by default", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-home."))
    const result = await runLfgText(["install"], "n\nn\n", { HOME: home })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("lfg install")
    expect(result.stdout).toContain("npx lazycodex-ai install")
    expect(result.stdout).toContain("Install now?")
    expect(result.stdout).toContain("Configure Grok BYOK now?")
    expect(result.stdout).toContain("Skipped install")
    expect(result.stdout).toContain("Skipped Grok BYOK configuration")
    expect(result.stdout).not.toContain('"ok"')
  })

  test("interactive install wizard runs npx when confirmed", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-home."))
    const fakeBin = await makeFakeNpx(0)
    const result = await runLfgText(["install"], "y\nn\n", { HOME: home, PATH: `${fakeBin}:${process.env.PATH ?? ""}` })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("Install now?")
    expect(result.stdout).toContain("fake lazycodex install")
    expect(result.stdout).toContain("Installed lazycodex adapter")
    expect(result.stdout).toContain("Configure Grok BYOK now?")
  })

  test("runs lazycodex installer through npx when explicitly requested", async () => {
    const fakeBin = await makeFakeNpx(0)
    const result = await runLfg(["--json", "lazycodex", "install", "--run"], { PATH: `${fakeBin}:${process.env.PATH ?? ""}` })

    expect(result.exitCode).toBe(0)
    expect(result.json).toMatchObject({
      ok: true,
      status: "installed",
      executed: true,
      installerCommand: "npx lazycodex-ai install",
      installerArgs: ["lazycodex-ai", "install"],
      exitCode: 0,
    })
    expect(JSON.stringify(result.json)).toContain("fake lazycodex install")
  })

  test("reports npx installer failure", async () => {
    const fakeBin = await makeFakeNpx(7)
    const result = await runLfg(["--json", "lazycodex", "install", "--run"], { PATH: `${fakeBin}:${process.env.PATH ?? ""}` })

    expect(result.exitCode).toBe(1)
    expect(result.json).toMatchObject({
      ok: false,
      status: "install_failed",
      executed: true,
      installerCommand: "npx lazycodex-ai install",
      exitCode: 7,
    })
    expect(JSON.stringify(result.json)).toContain("fake lazycodex failure")
  })

  test("status and setup describe lfg as adapter installer not plugin", async () => {
    const status = await runLfg(["--json", "status"])
    expect(status.exitCode).toBe(0)
    expect(status.json).toMatchObject({ ok: true, purpose: "Install lazycodex Codex adapter for grok-build", lfgIsPlugin: false })
    expect(JSON.stringify(status.json)).not.toContain("Grok plugin")
    expect(JSON.stringify(status.json)).not.toContain("grok_plugin")

    const setup = await runLfg(["--json", "setup", "install-plan"])
    expect(setup.exitCode).toBe(0)
    expect(setup.json).toMatchObject({ lazycodex: { adapterPackage: "lazycodex-ai", installerCommand: "npx lazycodex-ai install", lfgIsPlugin: false } })
    expect(JSON.stringify(setup.json)).not.toContain("Grok plugin")
    expect(JSON.stringify(setup.json)).not.toContain("grok_plugin")
  })

  test("doctor requires npx but does not present bun as installer prerequisite", async () => {
    const result = await runLfg(["--json", "doctor"])
    expect(result.exitCode).toBe(0)
    expect(JSON.stringify(result.json)).toContain("exe:npx")
    expect(JSON.stringify(result.json)).not.toContain("exe:bun")
  })

  test("unsupported ulw command explains lfg scope", async () => {
    const result = await runLfg(["--json", "ulw"])
    expect(result.exitCode).toBe(1)
    expect(result.json).toMatchObject({
      ok: false,
      status: "error",
      code: "unsupported_command",
      command: "ulw",
      role: "lazycodex_adapter_installer",
      installerCommand: "npx lazycodex-ai install",
      lfgIsPlugin: false,
    })
    expect(JSON.stringify(result.json)).toContain("does not run ulw")
  })

  test("unknown command lists supported command names", async () => {
    const result = await runLfg(["--json", "wat"])
    expect(result.exitCode).toBe(1)
    expect(result.json).toMatchObject({
      ok: false,
      code: "unsupported_command",
      command: "wat",
      supportedCommands: ["install", "status", "doctor", "config grok-byok", "lazycodex install", "lazycodex status", "setup install-plan", "setup show"],
    })
  })

  test("uses configured lazycodex adapter root", async () => {
    const adapterRoot = await makeAdapterRoot()
    const result = await runLfg(["--json", "lazycodex", "status"], { LAZYCODEX_ADAPTER_ROOT: adapterRoot })

    expect(result.exitCode).toBe(0)
    expect(result.json).toMatchObject({
      grokSurfaces: {
        customModelConfig: expect.stringContaining(join(".grok", "config.toml")),
        globalAgentRoot: expect.stringContaining(join(".grok", "agents")),
        projectAgentRoot: expect.stringContaining(join(".grok", "agents")),
        acpCommand: "grok agent stdio",
        globalPluginRoot: expect.stringContaining(join(".grok", "plugins")),
        projectPluginRoot: expect.stringContaining(join(".grok", "plugins")),
        userMcpConfig: expect.stringContaining(join(".grok", "config.toml")),
        projectMcpConfig: expect.stringContaining(join(".grok", "config.toml")),
        projectRootMcpConfig: expect.stringContaining(".mcp.json"),
      },
      verificationCommands: expect.arrayContaining(["grok models", "grok inspect --json", "grok plugin list --json"]),
      adapter: {
        found: true,
        root: adapterRoot,
        manifest: join(adapterRoot, ".codex-plugin", "plugin.json"),
        mcpConfig: join(adapterRoot, ".mcp.json"),
        skillsDir: join(adapterRoot, "skills"),
      },
    })
  })

  test("detects grok installed lazycodex adapter when primary plugin path is absent", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-home."))
    const adapterRoot = await makeAdapterRoot(join(home, ".grok", "installed-plugins", "0-1-0-ff47fdd7"))
    const result = await runLfg(["--json", "lazycodex", "status"], { HOME: home })

    expect(result.exitCode).toBe(0)
    expect(result.json).toMatchObject({
      adapter: {
        found: true,
        root: adapterRoot,
        manifest: join(adapterRoot, ".codex-plugin", "plugin.json"),
      },
    })
  })
})

async function runLfg(args: readonly string[], env: Readonly<Record<string, string>> = {}): Promise<{ readonly exitCode: number; readonly json: unknown }> {
  const proc = Bun.spawn([LFG, ...args], { stdout: "pipe", stderr: "pipe", env: { ...process.env, ...env } })
  const [stdout, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited])
  return { exitCode, json: JSON.parse(stdout) as unknown }
}

async function runLfgText(args: readonly string[], input: string, env: Readonly<Record<string, string>> = {}): Promise<{ readonly exitCode: number; readonly stdout: string; readonly stderr: string }> {
  const proc = Bun.spawn([LFG, ...args], { stdin: "pipe", stdout: "pipe", stderr: "pipe", env: { ...process.env, ...env } })
  proc.stdin.write(input)
  proc.stdin.end()
  const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited])
  return { exitCode, stdout, stderr }
}

async function makeAdapterRoot(root = ""): Promise<string> {
  const adapterRoot = root || (await mkdtemp(join(tmpdir(), "lfg-lazycodex-adapter.")))
  await mkdir(join(adapterRoot, ".codex-plugin"), { recursive: true })
  await mkdir(join(adapterRoot, "skills"), { recursive: true })
  await writeFile(join(adapterRoot, ".codex-plugin", "plugin.json"), `${JSON.stringify({ name: "lazycodex", version: "0.1.0" })}\n`)
  await writeFile(join(adapterRoot, ".mcp.json"), `${JSON.stringify({ mcpServers: {} })}\n`)
  return adapterRoot
}

async function makeFakeNpx(exitCode: number): Promise<string> {
  const bin = await mkdtemp(join(tmpdir(), "lfg-fake-npx."))
  const body = exitCode === 0 ? "echo fake lazycodex install: $*" : "echo fake lazycodex failure: $* >&2"
  await writeFile(join(bin, "npx"), `#!/usr/bin/env bash\n${body}\nexit ${exitCode}\n`)
  await chmod(join(bin, "npx"), 0o755)
  return bin
}
