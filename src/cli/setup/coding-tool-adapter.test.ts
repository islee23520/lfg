import { describe, expect, test } from "vitest"
import {
  codingToolAdapterContractJson,
  codingToolAdapterExecutionPlanJson,
  codingToolAdapterSelectionJson,
  isCodingToolAdapterId,
  normalizeCodingToolAdapterId,
} from "./coding-tool-adapter"

describe("coding tool adapter selection", () => {
  test("serializes the Grok-only adapter contract", () => {
    expect(codingToolAdapterSelectionJson()).toMatchObject({
      selected: "grok",
      default: "grok",
      supported: ["grok"],
      contract: {
        id: "grok",
        command: "grok",
      },
      contracts: {
        grok: {
          command: "grok",
          fallbackAdapter: null,
        },
      },
    })
  })

  test("accepts only grok adapter id", () => {
    expect(isCodingToolAdapterId("grok")).toBe(true)
    expect(isCodingToolAdapterId("pi-agent")).toBe(false)
    expect(isCodingToolAdapterId("python")).toBe(false)
    expect(isCodingToolAdapterId(null)).toBe(false)
    expect(normalizeCodingToolAdapterId("pi-agent")).toBe("grok")
  })

  test("serializes execution contract for grok", () => {
    expect(codingToolAdapterContractJson("grok")).toMatchObject({
      id: "grok",
      command: "grok",
      args: [],
      requiredFiles: ["~/.grok/plugins/lfg", "~/.grok/lfg.json"],
      fallbackAdapter: null,
      failureBehavior: "Use GrokBuild host failure semantics; lfg does not own Grok host auth or retry policy.",
    })
  })

  test("builds non-executing invocation plan for grok", () => {
    expect(codingToolAdapterExecutionPlanJson("grok")).toMatchObject({
      selected: "grok",
      mode: "host_command",
      command: "grok",
      argv: ["grok"],
      executionStatus: "not_executed",
      fallbackAdapter: null,
      fallbackArgv: null,
    })
  })
})
