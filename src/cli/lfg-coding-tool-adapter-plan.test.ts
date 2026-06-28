import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { runLfg } from "./test/test-process"

describe("lfg coding tool adapter setup plan", () => {
  test("setup plan exposes the default Grok adapter contract", async () => {
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
        supported: ["grok", "pi-agent"],
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
          "pi-agent": {
            command: "pi-agent",
            fallbackAdapter: null,
          },
        },
      },
    })
  })

  test("setup plan accepts a pi-agent coding tool adapter selection", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-plan-adapter-home-"))
    const result = await runLfg(["--json", "setup", "--coding-tool-adapter", "pi-agent"], {
      HOME: home,
      LFG_DISABLE_DEFAULT_MODELS_PROXY: "1",
    })

    expect(result.exitCode).toBe(0)
    expect(result.json).toMatchObject({
      ok: true,
      status: "planned",
      command: "setup",
      executed: false,
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
    })
  })
})
