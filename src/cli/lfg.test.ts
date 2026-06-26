import { mkdtemp, readFile } from "node:fs/promises"
import { execFile } from "node:child_process"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { withModelServer } from "./test/test-model-server"
import { runLfg, runLfgText } from "./test/test-process"

describe("lfg CLI", () => {
  test("setup returns a non-mutating install plan by default", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-plan-home-"))
    const result = await runLfg(["--json", "setup"], { HOME: home, LFG_DISABLE_DEFAULT_MODELS_PROXY: "1" })

    expect(result.exitCode).toBe(0)
    expect(result.json).toMatchObject({
      ok: true,
      status: "planned",
      command: "setup",
      dryRun: false,
      executed: false,
      installerCommand: "@islee23520/lfg internal grok-install",
      lfpInstallerCommand: "@islee23520/lfg internal grok-install",
      companionPackage: "lfg-grok-install",
      packageExecutors: ["npx @islee23520/lfg"],
      modelDiscovery: {
        required: false,
        endpoint: "OpenAI-compatible /v1/models",
      },
    })
  })

  test("json setup can fetch OpenAI-compatible models and map them", async () => {
    await withModelServer(["gpt-4.1-mini", "o3-mini"], async (baseUrl) => {
      const result = await runLfg(["--json", "setup", "--base-url", baseUrl], {})

      expect(result.exitCode).toBe(0)
      expect(result.json).toMatchObject({
        ok: true,
        status: "planned",
        modelDiscovery: {
          baseUrl,
          modelsUrl: `${baseUrl}/v1/models`,
          modelIds: ["gpt-4.1-mini", "o3-mini"],
          mapping: {
            default: "gpt-4.1-mini",
            fast: "gpt-4.1-mini",
            reasoning: "o3-mini",
            coding: "gpt-4.1-mini",
          },
        },
      })
    })
  })

  test("npm run setup reaches the setup command surface", async () => {
    const result = await execFileResult("npm", ["run", "--silent", "setup", "--", "--json"])

    expect(result.exitCode).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      status: "planned",
      command: "setup",
      installerCommand: "@islee23520/lfg internal grok-install",
      lfpInstallerCommand: "@islee23520/lfg internal grok-install",
    })
  })

  test("posix shell launcher works from a Korean cwd", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "한국어 삭제."))
    const shimPath = new URL("../../bin/lfg.js", import.meta.url).pathname
    const syntax = await execFileResult("sh", ["-n", shimPath])
    const result = await execFileResult("sh", [shimPath, "--json", "setup"], cwd)

    expect(syntax.exitCode).toBe(0)
    expect(result.exitCode).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      status: "planned",
      command: "setup",
    })
  })

  test("setup run is the only explicit installer execution surface", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-home."))
    const result = await runLfg(["--json", "setup", "--run"], { HOME: home })

    expect(result.exitCode).toBe(0)
    expect(result.json).toMatchObject({
      ok: true,
      status: "installed",
      command: "setup",
      executed: true,
      installerCommand: "@islee23520/lfg internal grok-install",
      installerArgs: [],
      installPath: "grok",
    })
    expect(JSON.stringify(result.json)).toMatch(/grok omo install|fixture fallback|repaired adapter hooks/)
    const installers = (result.json as { installers?: readonly { packageName: string }[] }).installers
    expect(installers).toHaveLength(1)
    expect(installers?.[0]).toMatchObject({ packageName: "lfg-grok-install", exitCode: 0 })
    const nativeStamp = join(home, ".grok", "plugins", "lfg", "lfg-install.json")
    const legacyStamp = join(home, ".grok", "installed-plugins", "lfg", "lfg-install.json")
    await expect(readFile(nativeStamp, "utf8").catch(() => readFile(legacyStamp, "utf8"))).resolves.toContain("@islee23520/lfg")
    expect(result.json).toMatchObject({
      postInstallVerify: { ok: true, status: "verified" },
    })
  })

  test("setup run passes fetched model mapping to the upstream installer", async () => {
    await withModelServer(["gpt-4.1-mini", "o3-mini"], async (baseUrl) => {
      const home = await mkdtemp(join(tmpdir(), "lfg-home."))
      const result = await runLfg(["--json", "setup", "--base-url", baseUrl, "--run"], { HOME: home, OPENAI_API_KEY: "sk-test" })

      expect(result.exitCode).toBe(0)
      expect(result.json).toMatchObject({
        ok: true,
        status: "installed",
        modelDiscovery: {
          baseUrl,
          mapping: {
            default: "gpt-4.1-mini",
            reasoning: "o3-mini",
          },
        },
      })
      expect(JSON.stringify(result.json)).toContain("configUpdated")
      expect(JSON.stringify(result.json)).toContain("gpt-4.1-mini")
    })
  })

  test("interactive setup only confirms the upstream installer run", async () => {
    await withModelServer(["gpt-4.1-mini", "o3-mini"], async (baseUrl) => {
      const home = await mkdtemp(join(tmpdir(), "lfg-interactive-skip."))
      const result = await runLfgText(
        ["setup", "--no-tui"],
        `${baseUrl}\n\n\n\nn\n`,
        { HOME: home, LFG_DISABLE_DEFAULT_MODELS_PROXY: "1" },
      )

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain("lfg setup")
      expect(result.stdout).toContain("OpenAI-compatible base URL")
      expect(result.stdout).toContain("Found 2 models")
      expect(result.stdout).toContain("reasoning: o3-mini")
      expect(result.stdout).toContain("@islee23520/lfg internal grok-install")
      expect(result.stdout).toContain("internal grok-install")
      expect(result.stdout).toContain("Install now? [y/N]")
      expect(result.stdout).toContain("Skipped install")
      expect(result.stdout).not.toContain("Restore previous Grok settings")
    })
  })

  test("interactive role recommendations only show available models", async () => {
    await withModelServer(["grok-3-mini-fast"], async (baseUrl) => {
      const home = await mkdtemp(join(tmpdir(), "lfg-interactive-model-rec."))
      const input = `${baseUrl}\n\n\n\nn\n`
      const result = await runLfgText(["setup", "--no-tui"], input, { HOME: home, LFG_DISABLE_DEFAULT_MODELS_PROXY: "1" })

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain("grok-3-mini-fast")
      expect(result.stdout).toContain("Choose one global model preset")
      expect(result.stdout).toContain("Global reasoning effort")
      expect(result.stdout).not.toContain("Configure default / ULW target models and other LazyCodex agents?")
      expect(result.stdout).not.toContain("Recommended: gpt-5.5")
      expect(result.stdout).not.toContain("Recommended: grok-4.20-0309-reasoning")
    })
  })

  test("unsupported commands advertise setup only", async () => {
    for (const legacy of [["--json", "dry-setup"], ["--json", "install"], ["--json", "setup", "show"]] as const) {
      const result = await runLfg(legacy)
      expect(result.exitCode).toBe(1)
      expect(result.json).toMatchObject({
        ok: false,
        status: "error",
        code: "unsupported_command",
        supportedCommands: ["setup", "xai"],
      })
    }
  })

  test("help advertises only setup", async () => {
    const result = await runLfgText(["help"], "", {})

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("lfg setup")
    expect(result.stdout).toContain("npx @islee23520/lfg setup")
    expect(result.stdout).toContain("Setup run implementation:")
    expect(result.stdout).toContain("@islee23520/lfg internal grok-install")
    expect(result.stdout).not.toContain("npx lazycodex-ai install")
    expect(result.stdout).not.toContain("dry-setup")
    expect(result.stdout).not.toContain("doctor")
    expect(result.stdout).not.toContain("project-local")
    expect(result.stdout).not.toContain("bunx")
  })

})

function execFileResult(file: string, args: readonly string[], cwd = process.cwd()): Promise<{ readonly exitCode: number; readonly stdout: string }> {
  return execFileResultEnv(file, args, cwd, {})
}

function execFileResultEnv(
  file: string,
  args: readonly string[],
  cwd: string,
  env: Readonly<Record<string, string>>,
): Promise<{ readonly exitCode: number; readonly stdout: string }> {
  return new Promise((resolve) => {
    execFile(file, [...args], { cwd, env: { ...process.env, ...env } }, (error, stdout) => {
      const exitCode = typeof error === "object" && error !== null && "code" in error && typeof error.code === "number" ? error.code : 0
      resolve({ exitCode, stdout })
    })
  })
}
