import { describe, expect, test, vi } from "vitest"
import type { ModelDiscovery } from "./lfg-models"

vi.mock("@clack/prompts", () => {
  const calls: unknown[][] = []
  const prompts = {
    intro: (message: string) => calls.push(["intro", message]),
    note: (message: string, title?: string) => calls.push(["note", title, message]),
    confirm: async (options: { readonly message?: string }) => {
      calls.push(["confirm", options.message])
      return true
    },
    select: async (options: { readonly message?: string; readonly options?: readonly { readonly value?: string }[] }) => {
      calls.push(["select", options.message])
      return options.options?.[0]?.value ?? "grok-3-mini-fast"
    },
    autocomplete: async (options: {
      readonly message?: string
      readonly options?: readonly { readonly value?: string }[]
      readonly initialValue?: string
    }) => {
      calls.push(["autocomplete", options.message])
      return options.initialValue ?? options.options?.[0]?.value ?? "grok-3-mini-fast"
    },
    isCancel: (value: unknown) => value === Symbol.for("clack-cancel"),
    cancel: (message: string) => calls.push(["cancel", message]),
    outro: (message: string) => calls.push(["outro", message]),
  }
  return { ...prompts, __calls: calls, default: prompts }
})

vi.mock("picocolors", () => ({
  default: {
    inverse: (value: string) => value,
    green: (value: string) => value,
  },
}))

const installerMock = vi.hoisted(() => ({
  runLazycodexInstaller: vi.fn(async () => ({ ok: true, stdout: "", stderr: "" })),
}))

vi.mock("./lfg-installer.js", () => installerMock)

import * as tui from "./lfg-setup-tui"

describe("lfg-setup-tui model routing", () => {
  test("sisyphus selection becomes the persisted Grok default model", async () => {
    const prompts = await import("@clack/prompts") as any
    prompts.__calls.length = 0
    installerMock.runLazycodexInstaller.mockClear()

    const origSelect = prompts.select
    const origAutocomplete = prompts.autocomplete
    prompts.select = async (options: any) => (/model/i.test(String(options.message ?? "")) && /sisyphus/i.test(String(options.message ?? "")) ? "grok-4.3" : String(options.options?.[0]?.value ?? "grok-3-mini-fast"))
    prompts.autocomplete = async (options: any) =>
      /model/i.test(String(options.message ?? "")) && /sisyphus/i.test(String(options.message ?? ""))
        ? "grok-4.3"
        : String(options.initialValue ?? options.options?.[0]?.value ?? "grok-3-mini-fast")
    const origConfirm = prompts.confirm
    prompts.confirm = async () => true as const

    await tui.runSetupTui({}, { plan: {}, resolved: { discovery: discovery(["grok-3-mini-fast", "grok-4.3"]) } }, {
      prompts,
      colors: { inverse: (value: string) => value, green: (value: string) => value },
    })

    prompts.select = origSelect
    prompts.autocomplete = origAutocomplete
    prompts.confirm = origConfirm

    expect(installerMock.runLazycodexInstaller).toHaveBeenCalledTimes(1)
    const installerCalls = installerMock.runLazycodexInstaller.mock.calls as unknown as readonly [ModelDiscovery][]
    const configuredDiscovery = installerCalls[0]?.[0]
    expect(configuredDiscovery?.mapping.default).toBe("grok-4.3")
    expect(configuredDiscovery?.agentOverrideMap?.sisyphus?.model).toBe("grok-4.3")
  })

  test("fast tier maps to fast model id for Grok routing", async () => {
    const prompts = await import("@clack/prompts") as any
    const calls: any[] = prompts.__calls
    calls.length = 0

    const origSelect = prompts.select
    const origAutocomplete = prompts.autocomplete
    prompts.select = async (options: any) => {
      calls.push(["select", options.message])
      const message = String(options.message ?? "")
      if (/service tier/i.test(message) && /explorer/i.test(message)) return "fast"
      if (/model/i.test(message) && /explorer/i.test(message)) return "grok-3-mini"
      return String(options.options?.[0]?.value ?? "grok-3-mini-fast")
    }
    prompts.autocomplete = async (options: any) => {
      calls.push(["autocomplete", options.message])
      return /model/i.test(String(options.message ?? "")) && /explorer/i.test(String(options.message ?? ""))
        ? "grok-3-mini"
        : String(options.initialValue ?? options.options?.[0]?.value ?? "grok-3-mini-fast")
    }
    const origConfirm = prompts.confirm
    prompts.confirm = async (options: any) => !/Install now\?|Core \+ ULW/i.test(String(options.message ?? ""))

    await tui.runSetupTui({}, { plan: {}, resolved: { discovery: discovery(["grok-3-mini", "grok-3-mini-fast"]) } }, {
      prompts,
      colors: { inverse: (value: string) => value, green: (value: string) => value },
    })

    prompts.select = origSelect
    prompts.autocomplete = origAutocomplete
    prompts.confirm = origConfirm

    const resultsNote = calls.find((call) => call[0] === "note" && /Setup results/.test(String(call[1])))
    const resultsBody = resultsNote ? String(resultsNote[2] ?? "") : ""
    expect(resultsBody).toMatch(/explorer:\s+grok-3-mini-fast\s+\/\s+low\s+\(tier:\s+fast\)/)
    const outroText = calls.filter((call) => call[0] === "outro").map((call) => String(call[1])).join("\n")
    expect(outroText).toContain("lfg setup --run")
    expect(outroText).not.toContain("lfg doctor")
  })
})

function discovery(modelIds: readonly string[]): ModelDiscovery {
  return {
    baseUrl: "http://127.0.0.1:8317/v1",
    modelsUrl: "http://127.0.0.1:8317/v1/models",
    modelIds: [...modelIds, "grok-4.20-0309-reasoning", "gpt-5.3-codex-spark"],
    mapping: {
      default: modelIds[0] ?? "grok-3-mini-fast",
      fast: modelIds.find((id) => id.endsWith("-fast")) ?? modelIds[0] ?? "grok-3-mini-fast",
      reasoning: "grok-4.20-0309-reasoning",
      coding: "gpt-5.3-codex-spark",
    },
  }
}
