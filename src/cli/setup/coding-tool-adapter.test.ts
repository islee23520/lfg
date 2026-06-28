import { describe, expect, test } from "vitest"
import {
  codingToolAdapterContractJson,
  codingToolAdapterExecutionPlanJson,
  codingToolAdapterSelectionJson,
  isCodingToolAdapterId,
} from "./coding-tool-adapter"

describe("coding tool adapter selection", () => {
  test("serializes the default Lazy Grok adapter choices", () => {
    expect(codingToolAdapterSelectionJson()).toMatchObject({
      selected: "grok",
      default: "grok",
      supported: ["grok", "pi-agent"],
      contract: {
        id: "grok",
        command: "grok",
      },
      contracts: {
        "pi-agent": {
      command: "pi-agent",
      fallbackAdapter: null,
        },
      },
    })
  })

  test("accepts only supported adapter ids", () => {
    expect(isCodingToolAdapterId("grok")).toBe(true)
    expect(isCodingToolAdapterId("pi-agent")).toBe(true)
    expect(isCodingToolAdapterId("python")).toBe(false)
    expect(isCodingToolAdapterId(null)).toBe(false)
  })

  test("serializes execution contracts for all supported adapters", () => {
    expect(codingToolAdapterContractJson("grok")).toMatchObject({
      id: "grok",
      command: "grok",
      args: [],
      requiredFiles: ["~/.grok/plugins/lfg", "~/.grok/lfg.json"],
      fallbackAdapter: null,
      failureBehavior: "Use GrokBuild host failure semantics; lfg does not own Grok host auth or retry policy.",
    })
    expect(codingToolAdapterContractJson("pi-agent")).toMatchObject({
      id: "pi-agent",
      command: "pi-agent",
      args: ["run"],
      requiredFiles: ["~/.grok/plugins/lfg", "~/.grok/lfg.json"],
      fallbackAdapter: null,
      failureBehavior: "Fail closed before execution when pi-agent is unavailable; rerun setup with the grok adapter to switch routes.",
      fallbackBehavior: "No automatic adapter fallback; lfg never launches a different coding tool than the selected adapter.",
    })
  })

  test("builds non-executing invocation plans for supported adapters", () => {
    expect(codingToolAdapterExecutionPlanJson("grok")).toMatchObject({
      selected: "grok",
      mode: "host_command",
      command: "grok",
      argv: ["grok"],
      executionStatus: "not_executed",
      fallbackAdapter: null,
      fallbackArgv: null,
    })
    expect(codingToolAdapterExecutionPlanJson("pi-agent")).toMatchObject({
      selected: "pi-agent",
      mode: "host_command",
      command: "pi-agent",
      argv: ["pi-agent", "run"],
      executionStatus: "not_executed",
      fallbackAdapter: null,
      fallbackArgv: null,
    })
  })
})
