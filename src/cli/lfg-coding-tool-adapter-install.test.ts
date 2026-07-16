import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { runLfg } from "./test/test-process"

describe("lfg coding tool adapter install", () => {
  test("setup --run always records Grok adapter (pi-agent rejected)", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-grok-adapter-run-"))
    const path = await fakeCodexPath(home)
    const rejected = await runLfg(["--json", "setup", "--run", "--coding-tool-adapter", "pi-agent"], {
      HOME: home,
      LFG_DISABLE_DEFAULT_MODELS_PROXY: "1",
      PATH: path,
    })
    expect(rejected.exitCode).toBe(1)
    expect(rejected.json).toMatchObject({
      ok: false,
      status: "invalid_coding_tool_adapter",
      supportedCodingToolAdapters: ["grok"],
    })

    const result = await runLfg(["--json", "setup", "--run"], {
      HOME: home,
      LFG_DISABLE_DEFAULT_MODELS_PROXY: "1",
      PATH: path,
    })

    expect(result.exitCode).toBe(0)
    expect(result.json).toMatchObject({
      codingToolAdapter: {
        selected: "grok",
        default: "grok",
        supported: ["grok"],
        contract: {
          id: "grok",
          command: "grok",
          args: [],
          fallbackAdapter: null,
        },
        executionPlan: {
          selected: "grok",
          command: "grok",
          argv: ["grok"],
          executionStatus: "not_executed",
          fallbackAdapter: null,
          fallbackArgv: null,
        },
      },
    })

    // Settings live only in config.toml; retired lfg.json / lfg-config.jsonc are not written.
    const configToml = await readFile(join(home, ".grok", "config.toml"), "utf8")
    expect(configToml).not.toContain("[omo.models]")
    expect(result.json).toMatchObject({
      lfgConfigPath: join(home, ".grok", "config.toml"),
    })
    await expect(readFile(join(home, ".grok", "lfg.json"), "utf8")).rejects.toMatchObject({ code: "ENOENT" })
    await expect(readFile(join(home, ".grok", "lfg-config.jsonc"), "utf8")).rejects.toMatchObject({ code: "ENOENT" })
    await expect(readFile(join(home, ".grok", "lfg-config.schema.json"), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    })
  }, 15_000)

  test("setup --run deletes pre-existing retired lfg.json / jsonc / schema", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-grok-adapter-retire-"))
    const path = await fakeCodexPath(home)
    await mkdir(join(home, ".grok"), { recursive: true })
    await writeFile(join(home, ".grok", "lfg.json"), '{"version":1}\n', "utf8")
    await writeFile(join(home, ".grok", "lfg-config.jsonc"), '{"version":1}\n', "utf8")
    await writeFile(join(home, ".grok", "lfg-config.schema.json"), "{}\n", "utf8")

    const result = await runLfg(["--json", "setup", "--run"], {
      HOME: home,
      LFG_DISABLE_DEFAULT_MODELS_PROXY: "1",
      PATH: path,
    })
    expect(result.exitCode).toBe(0)
    await expect(readFile(join(home, ".grok", "lfg.json"), "utf8")).rejects.toMatchObject({ code: "ENOENT" })
    await expect(readFile(join(home, ".grok", "lfg-config.jsonc"), "utf8")).rejects.toMatchObject({ code: "ENOENT" })
    await expect(readFile(join(home, ".grok", "lfg-config.schema.json"), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    })
  }, 15_000)

  test("setup --run keeps Grok adapter on re-run", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-grok-adapter-preserve-"))
    const path = await fakeCodexPath(home)
    const first = await runLfg(["--json", "setup", "--run"], {
      HOME: home,
      LFG_DISABLE_DEFAULT_MODELS_PROXY: "1",
      PATH: path,
    })
    expect(first.exitCode).toBe(0)

    const second = await runLfg(["--json", "setup", "--run"], {
      HOME: home,
      LFG_DISABLE_DEFAULT_MODELS_PROXY: "1",
      PATH: path,
    })
    expect(second.exitCode).toBe(0)
    expect(second.json).toMatchObject({
      codingToolAdapter: { selected: "grok" },
      lfgConfigPath: join(home, ".grok", "config.toml"),
    })
  }, 15_000)

  test("grok adapter setup removes stale proxy routing for vanilla host auth", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-grok-adapter-vanilla-"))
    const path = await fakeCodexPath(home)
    const configPath = join(home, ".grok", "config.toml")
    await mkdir(join(home, ".grok"), { recursive: true })
    await writeFile(
      configPath,
      [
        "[endpoints]",
        'models_base_url = "http://127.0.0.1:8317/v1"',
        "",
        '[model."grok-build"]',
        'model = "gpt-5.5"',
        'base_url = "http://127.0.0.1:8317/v1"',
      ].join("\n"),
      "utf8",
    )

    const result = await runLfg(["--json", "setup", "--run", "--coding-tool-adapter", "grok"], {
      HOME: home,
      LFG_DISABLE_DEFAULT_MODELS_PROXY: "1",
      PATH: path,
    })

    expect(result.exitCode).toBe(0)
    const config = await readFile(configPath, "utf8")
    expect(config).not.toContain("models_base_url")
    expect(config).not.toContain('base_url = "http://127.0.0.1:8317/v1"')
    expect(config).not.toContain("[model.")

    // Retired lfg.json must not be required or recreated for adapter selection.
    await expect(readFile(join(home, ".grok", "lfg.json"), "utf8")).rejects.toMatchObject({ code: "ENOENT" })
  }, 15_000)
})

async function fakeCodexPath(home: string): Promise<string> {
  const bin = join(home, "bin")
  await mkdir(bin, { recursive: true })
  const codex = join(bin, "codex")
  await writeFile(codex, "#!/bin/sh\nexit 0\n", "utf8")
  await chmod(codex, 0o755)
  return `${bin}:/usr/bin:/bin`
}
