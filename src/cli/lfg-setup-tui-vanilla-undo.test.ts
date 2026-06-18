import { describe, expect, test, vi } from "vitest"

vi.mock("@clack/prompts", () => {
  const calls: unknown[][] = []
  const prompts = {
    intro: (m: string) => calls.push(["intro", m]),
    note: (m: string, title?: string) => calls.push(["note", title, m]),
    confirm: async (opts: { readonly message?: string }) => {
      calls.push(["confirm", opts.message])
      return true
    },
    select: async (opts: { readonly message?: string; readonly options?: readonly { readonly value: string }[] }) => {
      calls.push(["select", opts.message])
      return opts.options?.[0]?.value ?? "grok-3-mini-fast"
    },
    autocomplete: async (opts: { readonly message?: string; readonly options?: readonly { readonly value: string }[]; readonly initialValue?: string }) => {
      calls.push(["autocomplete", opts.message])
      return opts.initialValue ?? opts.options?.[0]?.value ?? "grok-3-mini-fast"
    },
    isCancel: (v: unknown) => v === Symbol.for("clack-cancel"),
    cancel: (m: string) => calls.push(["cancel", m]),
    outro: (m: string) => calls.push(["outro", m]),
  }
  return { ...prompts, __calls: calls, default: prompts }
})

vi.mock("picocolors", () => ({
  default: { inverse: (s: string) => s, green: (s: string) => s },
}))

const installerMock = vi.hoisted(() => ({
  runLazycodexInstaller: vi.fn(async () => ({ ok: true, stdout: "", stderr: "" })),
}))

vi.mock("./lfg-installer.js", () => installerMock)

import * as tui from "./lfg-setup-tui"

function discovery() {
  return {
    baseUrl: "http://127.0.0.1:8317/v1",
    modelsUrl: "http://127.0.0.1:8317/v1/models",
    modelIds: ["grok-3-mini-fast", "grok-4.20-0309-reasoning", "gpt-5.3-codex-spark"],
    mapping: { default: "grok-3-mini-fast", fast: "grok-3-mini-fast", reasoning: "grok-4.20-0309-reasoning", coding: "gpt-5.3-codex-spark" },
  }
}

describe("lfg-setup-tui vanilla + undo", () => {
  test("vanilla path (default) skips per-agent selection and installs Grok defaults", async () => {
    const prompts = (await import("@clack/prompts")) as any
    const calls: unknown[][] = prompts.__calls
    calls.length = 0
    installerMock.runLazycodexInstaller.mockClear()

    // select defaults to options[0] => "vanilla" for the Model setup question.
    await tui.runSetupTui({}, { plan: {}, resolved: { discovery: discovery() } }, {
      prompts,
      colors: { inverse: (s: string) => s, green: (s: string) => s },
    })

    // The mode question is present and Vanilla is its first/default option.
    const modeSelect = calls.find((c) => c[0] === "select" && /Model setup/.test(String(c[1])))
    expect(modeSelect).toBeTruthy()

    // NO per-agent model/tier/reasoning selects in the vanilla path (exclude the mode question itself).
    const perAgentModelPrompts = calls.filter((c) => {
      const msg = String(c[1] ?? "")
      return (c[0] === "autocomplete" || c[0] === "select") &&
        /model|service tier|reasoning/i.test(msg) &&
        !/Model setup/.test(msg)
    })
    expect(perAgentModelPrompts.length).toBe(0)

    // Vanilla summary + Setup results notes are present, with Grok models.
    expect(calls.some((c) => c[0] === "note" && /Vanilla Grok models/.test(String(c[1])))).toBe(true)
    const resultsNote = calls.find((c) => c[0] === "note" && /Setup results/.test(String(c[1])))
    const resultsBody = String(resultsNote?.[2] ?? "")
    expect(resultsBody).toMatch(/explorer:.*grok.*\(tier:/)

    // Install Summary + install executed with Grok agent overrides.
    expect(calls.some((c) => c[0] === "note" && /Install Summary/.test(String(c[1])))).toBe(true)
    expect(installerMock.runLazycodexInstaller).toHaveBeenCalledTimes(1)
    const installed = (installerMock.runLazycodexInstaller.mock.calls as unknown as ReadonlyArray<readonly unknown[]>)[0]?.[0] as Record<string, any>
    expect(installed?.agentOverrideMap?.sisyphus?.model).toMatch(/^grok/)
    expect(installed?.agentConfig?.explorer?.model).toMatch(/^grok/)
  })

  test("vanilla path works with no proxy (resolved discovery null)", async () => {
    const prompts = (await import("@clack/prompts")) as any
    const calls: unknown[][] = prompts.__calls
    calls.length = 0
    installerMock.runLazycodexInstaller.mockClear()

    await tui.runSetupTui({}, { plan: {}, resolved: null }, {
      prompts,
      colors: { inverse: (s: string) => s, green: (s: string) => s },
    })

    expect(installerMock.runLazycodexInstaller).toHaveBeenCalledTimes(1)
    const installed = (installerMock.runLazycodexInstaller.mock.calls as unknown as ReadonlyArray<readonly unknown[]>)[0]?.[0] as Record<string, any>
    expect(installed?.agentOverrideMap?.sisyphus?.model).toMatch(/^grok/)
  })

  test("per-agent keep/redo: answering 'no' re-runs just that agent", async () => {
    const prompts = (await import("@clack/prompts")) as any
    const calls: unknown[][] = prompts.__calls
    calls.length = 0

    let explorerModelShown = 0
    const origSelect = prompts.select
    const origAutocomplete = prompts.autocomplete
    const origConfirm = prompts.confirm
    prompts.select = async (opts: any) => {
      if (/Model setup/.test(String(opts.message ?? ""))) return "proxy"
      if (/service tier/i.test(String(opts.message ?? ""))) return "default"
      return String(opts.options?.[0]?.value ?? "grok-3-mini-fast")
    }
    prompts.autocomplete = async (opts: any) => {
      if (/explorer model/i.test(String(opts.message ?? ""))) explorerModelShown += 1
      return String(opts.initialValue ?? opts.options?.[0]?.value ?? "grok-3-mini-fast")
    }
    let explorerKeep = 0
    prompts.confirm = async (opts: any) => {
      const m = String(opts.message ?? "")
      calls.push(["confirm", m])
      if (/Keep explorer/.test(m)) {
        explorerKeep += 1
        return explorerKeep === 1 ? false : true
      }
      return true
    }

    await tui.runSetupTui({}, { plan: {}, resolved: { discovery: discovery() } }, {
      prompts,
      colors: { inverse: (s: string) => s, green: (s: string) => s },
    })

    prompts.select = origSelect
    prompts.autocomplete = origAutocomplete
    prompts.confirm = origConfirm

    // explorer model select shown twice: initial pick + one redo.
    expect(explorerModelShown).toBe(2)
    // The keep confirm was asked for explorer at least twice (initial + after redo).
    expect(explorerKeep).toBeGreaterThanOrEqual(2)
  })

  test("cancel on the keep/redo confirm aborts cleanly with no install", async () => {
    const prompts = (await import("@clack/prompts")) as any
    const calls: unknown[][] = prompts.__calls
    calls.length = 0
    installerMock.runLazycodexInstaller.mockClear()

    const CANCEL = Symbol.for("clack-cancel")
    const origSelect = prompts.select
    const origConfirm = prompts.confirm
    prompts.select = async (opts: any) => (/Model setup/.test(String(opts.message ?? "")) ? "proxy" : String(opts.options?.[0]?.value ?? "grok-3-mini-fast"))
    prompts.confirm = async (opts: any) => (/Keep explorer/.test(String(opts.message ?? "")) ? CANCEL : true)

    await expect(
      tui.runSetupTui({}, { plan: {}, resolved: { discovery: discovery() } }, {
        prompts,
        colors: { inverse: (s: string) => s, green: (s: string) => s },
      }),
    ).rejects.toThrow(/cancelled/)

    prompts.select = origSelect
    prompts.confirm = origConfirm

    expect(calls.some((c) => c[0] === "cancel")).toBe(true)
    expect(installerMock.runLazycodexInstaller).not.toHaveBeenCalled()
  })
})
