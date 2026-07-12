import { access, chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { execFile } from "node:child_process"
import { tmpdir } from "node:os"
import { delimiter, join } from "node:path"
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
      codingToolAdapter: {
        selected: "grok",
        default: "grok",
        supported: ["grok"],
      },
      modelDiscovery: {
        baseUrl: "",
        mapping: {
          default: expect.stringMatching(/^grok/),
          fast: expect.stringMatching(/^grok/),
          reasoning: expect.stringMatching(/^grok/),
          coding: expect.stringMatching(/^grok/),
        },
      },
    })
  })

  test("bare lfg fails before launching when adapter required files are missing", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-launch-home."))
    const bin = await mkdtemp(join(tmpdir(), "lfg-launch-bin."))
    const marker = join(home, "launch.txt")
    await mkdir(join(home, ".grok"), { recursive: true })
    await writeFile(join(home, ".grok", "lfg.json"), JSON.stringify({ version: 1, coding_tool_adapter: "grok" }))
    await writeFakeAdapter(join(bin, "grok"), marker)

    const result = await runLfgText([], "", {
      HOME: home,
      PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
      LFG_FAKE_ADAPTER_MARKER: marker,
    })

    expect(result.exitCode).toBe(78)
    expect(result.stderr).toContain("Cannot launch grok: required setup file is missing")
    expect(result.stderr).toContain(join(home, ".grok", "plugins", "lfg"))
    await expect(access(marker)).rejects.toThrow()
  })

  test("bare lfg fails before launching when runtime adapter config is missing", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-launch-missing-config-home."))
    const bin = await mkdtemp(join(tmpdir(), "lfg-launch-missing-config-bin."))
    const marker = join(home, "launch.txt")
    await mkdir(join(home, ".grok", "plugins", "lfg"), { recursive: true })
    await writeFakeAdapter(join(bin, "grok"), marker)

    const result = await runLfgText([], "", {
      HOME: home,
      PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
      LFG_FAKE_ADAPTER_MARKER: marker,
    })

    expect(result.exitCode).toBe(78)
    expect(result.stderr).toContain("Cannot launch grok: required setup file is missing")
    expect(result.stderr).toContain(join(home, ".grok", "lfg.json"))
    await expect(access(marker)).rejects.toThrow()
  })

  test("bare lfg launches Grok when required files exist", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-launch-ready-home."))
    const bin = await mkdtemp(join(tmpdir(), "lfg-launch-ready-bin."))
    const marker = join(home, "launch.txt")
    await mkdir(join(home, ".grok", "plugins", "lfg"), { recursive: true })
    await writeFile(join(home, ".grok", "lfg.json"), JSON.stringify({ version: 1, coding_tool_adapter: "grok" }))
    await writeFakeAdapter(join(bin, "grok"), marker)

    const result = await runLfgText([], "", {
      HOME: home,
      PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
      LFG_FAKE_ADAPTER_MARKER: marker,
    })

    expect(result.exitCode).toBe(0)
    await expect(readFile(marker, "utf8")).resolves.toBe("grok\n")
  })

  test("bare lfg ignores legacy pi-agent config and always launches grok", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-launch-override-home."))
    const bin = await mkdtemp(join(tmpdir(), "lfg-launch-override-bin."))
    const marker = join(home, "launch.txt")
    await mkdir(join(home, ".grok", "plugins", "lfg"), { recursive: true })
    await writeFile(join(home, ".grok", "lfg.json"), JSON.stringify({ version: 1, coding_tool_adapter: "pi-agent" }))
    await writeFakeAdapter(join(bin, "grok"), marker)

    const result = await runLfgText([], "", {
      HOME: home,
      PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
      LFG_FAKE_ADAPTER_MARKER: marker,
    })

    expect(result.exitCode).toBe(0)
    await expect(readFile(marker, "utf8")).resolves.toBe("grok\n")
  })

  test("bare lfg --json reports Grok launch plan without spawning", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-launch-json-home."))
    await mkdir(join(home, ".grok"), { recursive: true })
    await writeFile(join(home, ".grok", "lfg.json"), JSON.stringify({ version: 1, coding_tool_adapter: "pi-agent" }))

    const result = await runLfg(["--json"], { HOME: home })

    expect(result.exitCode).toBe(0)
    expect(result.json).toMatchObject({
      ok: true,
      status: "planned",
      command: "launch",
      dryRun: true,
      executed: false,
      codingToolAdapter: {
        selected: "grok",
        executionPlan: {
          argv: ["grok"],
          executionStatus: "not_executed",
        },
      },
    })
  })

  test("bare lfg fails clearly when the selected adapter command is unavailable", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-launch-missing-home."))
    const bin = await mkdtemp(join(tmpdir(), "lfg-launch-missing-bin."))
    await mkdir(join(home, ".grok", "plugins", "lfg"), { recursive: true })
    await writeFile(join(home, ".grok", "lfg.json"), JSON.stringify({ version: 1, coding_tool_adapter: "grok" }))

    const result = await runLfgText([], "", {
      HOME: home,
      PATH: bin,
    })

    expect(result.exitCode).toBe(127)
    expect(result.stderr).toContain('Cannot launch grok: command "grok" was not found on PATH')
  })

  test("setup rejects unsupported coding tool adapter selections", async () => {
    const result = await runLfg(["--json", "setup", "--coding-tool-adapter", "python"], {
      LFG_DISABLE_DEFAULT_MODELS_PROXY: "1",
    })

    expect(result.exitCode).toBe(1)
    expect(result.json).toMatchObject({
      ok: false,
      status: "invalid_coding_tool_adapter",
      error: "Unsupported coding tool adapter: python",
      supportedCodingToolAdapters: ["grok"],
    })
  })

  test("setup rejects removed presets with invalid_preset", async () => {
    const result = await runLfg(["--json", "setup", "--preset", "gpt"], { LFG_DISABLE_DEFAULT_MODELS_PROXY: "1" })

    expect(result.exitCode).toBe(1)
    expect(result.json).toMatchObject({
      ok: false,
      status: "invalid_preset",
      error: "Unsupported setup preset: gpt",
      supportedPresets: ["auto", "grok"],
    })
  })

  test("json setup can fetch OpenAI-compatible models and map them", async () => {
    await withModelServer(["grok-3-mini-fast", "grok-4.5"], async (baseUrl) => {
      const result = await runLfg(["--json", "setup", "--base-url", baseUrl], {})

      expect(result.exitCode).toBe(0)
      expect(result.json).toMatchObject({
        ok: true,
        status: "planned",
        modelDiscovery: {
          baseUrl,
          modelsUrl: `${baseUrl}/v1/models`,
          modelIds: ["grok-3-mini-fast", "grok-4.5"],
          mapping: {
            default: "grok-4.5",
            fast: "grok-3-mini-fast",
            reasoning: "grok-4.5",
            coding: "grok-3-mini-fast",
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
    await withModelServer(["grok-3-mini-fast", "grok-4.5"], async (baseUrl) => {
      const home = await mkdtemp(join(tmpdir(), "lfg-home."))
      const result = await runLfg(["--json", "setup", "--base-url", baseUrl, "--run"], { HOME: home, OPENAI_API_KEY: "sk-test" })

      expect(result.exitCode).toBe(0)
      expect(result.json).toMatchObject({
        ok: true,
        status: "installed",
        modelDiscovery: {
          baseUrl,
          mapping: {
            default: "grok-4.5",
            reasoning: "grok-4.5",
          },
        },
      })
      expect(JSON.stringify(result.json)).toContain("configUpdated")
      expect(JSON.stringify(result.json)).toContain("grok-4.5")
    })
  })

  test("interactive setup asks for model recommendations before install confirmation", async () => {
    await withModelServer(["grok-build-0.1", "glm-5-turbo", "grok-composer-2.5-fast", "grok-4.20-0309-reasoning"], async (baseUrl) => {
      const home = await mkdtemp(join(tmpdir(), "lfg-interactive-skip."))
      const result = await runLfgText(
        ["setup", "--no-tui", "--base-url", baseUrl],
        "\n\nn\n",
        { HOME: home, LFG_DISABLE_DEFAULT_MODELS_PROXY: "1" },
      )

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain("lfg setup")
      expect(result.stdout).toContain("Found 4 models")
      expect(result.stdout).toContain("Use LLM recommendations from your available models? [Y/n]")
      expect(result.stdout).toContain("Recommended model settings:")
      expect(result.stdout).toContain("default: grok-build-0.1")
      expect(result.stdout).toContain("fast: grok-composer-2.5-fast")
      expect(result.stdout).toContain("coding: grok-composer-2.5-fast")
      expect(result.stdout).toContain("Modify recommended model settings? [y/N]")
      expect(result.stdout).toContain("@islee23520/lfg internal grok-install")
      expect(result.stdout).toContain("internal grok-install")
      expect(result.stdout).toContain("Install now? [y/N]")
      expect(result.stdout).toContain("Skipped install")
      expect(result.stdout).not.toContain("Choose one global model preset")
      expect(result.stdout).not.toContain("Restore previous Grok settings")
    })
  })

  test("interactive role recommendations only show available models", async () => {
    await withModelServer(["grok-3-mini-fast"], async (baseUrl) => {
      const home = await mkdtemp(join(tmpdir(), "lfg-interactive-model-rec."))
      const input = "n\n\n\nn\n"
      const result = await runLfgText(["setup", "--no-tui", "--base-url", baseUrl], input, { HOME: home, LFG_DISABLE_DEFAULT_MODELS_PROXY: "1" })

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain("grok-3-mini-fast")
      expect(result.stdout).toContain("Use LLM recommendations from your available models? [Y/n]")
      expect(result.stdout).toContain("Choose one global model preset")
      expect(result.stdout).toContain("Global reasoning effort")
      expect(result.stdout).not.toContain("Configure default / ULW target models and other LazyCodex agents?")
      expect(result.stdout).not.toContain("Recommended: gpt-5.5")
      expect(result.stdout).not.toContain("Recommended: grok-4.20-0309-reasoning")
    })
  })

  test("interactive setup defaults to vanilla Grok without proxy or model optimization prompts", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-interactive-vanilla."))
    const result = await runLfgText(["setup", "--no-tui"], "n\nn\n", {
      HOME: home,
      LFG_DISABLE_DEFAULT_MODELS_PROXY: "1",
    })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("Using built-in Grok models directly")
    expect(result.stdout).toContain("default: grok-4.5")
    expect(result.stdout).toContain("fast: grok-composer-2.5-fast")
    expect(result.stdout).toContain("reasoning: grok-4.5")
    expect(result.stdout).not.toContain("grok-3-mini-fast")
    expect(result.stdout).not.toContain("Use OpenAI-compatible CLI proxy")
    expect(result.stdout).not.toContain("Use LLM recommendations from your available models?")
    expect(result.stdout).not.toContain("Choose one global model preset")
    expect(result.stdout).not.toContain("Global reasoning effort")
    expect(result.stdout).toContain("Model config: vanilla Grok host auth")  // --no-tui interactive path
    expect(result.stdout).toContain("Install now? [y/N]")
    expect(result.stdout).toContain("Skipped install")
  })

  test("unsupported commands advertise setup only", async () => {
    for (const legacy of [["--json", "dry-setup"], ["--json", "install"], ["--json", "setup", "show"]] as const) {
      const result = await runLfg(legacy)
      expect(result.exitCode).toBe(1)
      expect(result.json).toMatchObject({
        ok: false,
        status: "error",
        code: "unsupported_command",
        supportedCommands: ["setup", "xai", "zai", "mcp", "ulw", "ulw-loop"],
      })
    }
  })

  test("help advertises launch and explicit setup", async () => {
    const result = await runLfgText(["help"], "", {})

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("lfg                         # launches GrokBuild (Grok-only; requires lfg setup)")
    expect(result.stdout).toContain("lfg setup")
    expect(result.stdout).toContain("lfg setup --run")
    expect(result.stdout).toContain("lfg --json                  # prints the Grok launch plan without spawning")
    expect(result.stdout).toContain("npx @islee23520/lfg setup")
    expect(result.stdout).toContain("Setup run implementation:")
    expect(result.stdout).toContain("@islee23520/lfg internal grok-install")
    expect(result.stdout).not.toContain("npx lazycodex-ai install")
    expect(result.stdout).not.toContain("dry-setup")
    expect(result.stdout).not.toContain("pi-agent")
    expect(result.stdout).not.toContain("doctor")
    expect(result.stdout).not.toContain("project-local")
    expect(result.stdout).not.toContain("bunx")
  })

})

async function writeFakeAdapter(path: string, marker: string): Promise<void> {
  await writeFile(path, `#!/bin/sh\nprintf "%s" "$(basename "$0")" > "${marker}"\nif [ "$#" -gt 0 ]; then printf " %s" "$@" >> "${marker}"; fi\nprintf "\\n" >> "${marker}"\n`)
  await chmod(path, 0o755)
}

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
