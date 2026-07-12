import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { runLfg } from "./test/test-process"

describe("lfg coding tool adapter setup plan", () => {
  test("setup plan exposes the Grok-only adapter contract", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-plan-adapter-default-"))
    const result = await runLfg(["--json", "setup"], {
      HOME: home,
      LFG_DISABLE_DEFAULT_MODELS_PROXY: "1",
    })

    expect(result.exitCode).toBe(0)
    expect(result.json).toMatchObject({
      ok: true,
      status: "planned",
      codingToolAdapter: {
        selected: "grok",
        default: "grok",
        supported: ["grok"],
        contract: {
          id: "grok",
          command: "grok",
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
        contracts: {
          grok: {
            command: "grok",
            fallbackAdapter: null,
          },
        },
      },
    })
  })

  test("setup plan rejects pi-agent coding tool adapter selection", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-plan-adapter-home-"))
    const result = await runLfg(["--json", "setup", "--coding-tool-adapter", "pi-agent"], {
      HOME: home,
      LFG_DISABLE_DEFAULT_MODELS_PROXY: "1",
    })

    expect(result.exitCode).toBe(1)
    expect(result.json).toMatchObject({
      ok: false,
      status: "invalid_coding_tool_adapter",
      supportedCodingToolAdapters: ["grok"],
    })
  })
})
