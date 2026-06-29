import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { runLfg } from "./test/test-process"

describe("lfg coding tool adapter install", () => {
  test("setup --run records selected adapter contract, availability, and lfg config", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-grok-adapter-run-"))
    const result = await runLfg(["--json", "setup", "--run", "--coding-tool-adapter", "pi-agent"], {
      HOME: home,
      LFG_DISABLE_DEFAULT_MODELS_PROXY: "1",
      PATH: "/usr/bin:/bin",
    })

    expect(result.exitCode).toBe(0)
    expect(result.json).toMatchObject({
      codingToolAdapter: {
        selected: "pi-agent",
        default: "grok",
        supported: ["grok", "pi-agent"],
        contract: {
          id: "pi-agent",
          command: "pi-agent",
          args: ["run"],
          fallbackAdapter: null,
        },
        executionPlan: {
          selected: "pi-agent",
          command: "pi-agent",
          argv: ["pi-agent", "run"],
          executionStatus: "not_executed",
          fallbackAdapter: null,
          fallbackArgv: null,
        },
      },
      postInstallVerify: {
        codingToolAdapter: {
          selected: "pi-agent",
          executionPlan: {
            selected: "pi-agent",
            command: "pi-agent",
            argv: ["pi-agent", "run"],
            executionStatus: "not_executed",
            fallbackAdapter: null,
            fallbackArgv: null,
          },
          availability: {
            selected: "pi-agent",
            command: "pi-agent",
            status: "missing_command",
            fallbackAdapter: null,
          },
        },
      },
    })

    const configRaw = await readFile(join(home, ".grok", "lfg-config.jsonc"), "utf8")
    expect(configRaw).toContain('"coding_tool_adapter": "pi-agent"')

    const runtimeRaw = await readFile(join(home, ".grok", "lfg.json"), "utf8")
    const runtimeConfig = JSON.parse(runtimeRaw) as { readonly coding_tool_adapter?: string }
    expect(runtimeConfig.coding_tool_adapter).toBe("pi-agent")
  }, 15_000)

  test("setup --run preserves prior adapter selection when rerun without an explicit adapter flag", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-grok-adapter-preserve-"))
    const first = await runLfg(["--json", "setup", "--run", "--coding-tool-adapter", "pi-agent"], {
      HOME: home,
      LFG_DISABLE_DEFAULT_MODELS_PROXY: "1",
      PATH: "/usr/bin:/bin",
    })

    expect(first.exitCode).toBe(0)

    const second = await runLfg(["--json", "setup", "--run"], {
      HOME: home,
      LFG_DISABLE_DEFAULT_MODELS_PROXY: "1",
      PATH: "/usr/bin:/bin",
    })

    expect(second.exitCode).toBe(0)
    expect(second.json).toMatchObject({
      codingToolAdapter: {
        selected: "pi-agent",
      },
      postInstallVerify: {
        codingToolAdapter: {
          selected: "pi-agent",
        },
      },
    })

    const runtimeRaw = await readFile(join(home, ".grok", "lfg.json"), "utf8")
    const runtimeConfig = JSON.parse(runtimeRaw) as { readonly coding_tool_adapter?: string }
    expect(runtimeConfig.coding_tool_adapter).toBe("pi-agent")
  }, 15_000)

  test("grok adapter setup removes stale proxy routing for vanilla host auth", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-grok-adapter-vanilla-"))
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
      PATH: "/usr/bin:/bin",
    })

    expect(result.exitCode).toBe(0)
    const config = await readFile(configPath, "utf8")
    expect(config).not.toContain("models_base_url")
    expect(config).not.toContain('base_url = "http://127.0.0.1:8317/v1"')
    expect(config).toContain('default = "')
    expect(config).toContain("grok")

    const runtimeRaw = await readFile(join(home, ".grok", "lfg.json"), "utf8")
    expect(runtimeRaw).toContain('"coding_tool_adapter": "grok"')
    expect(runtimeRaw).not.toContain("cliproxy/")
  }, 15_000)
})
