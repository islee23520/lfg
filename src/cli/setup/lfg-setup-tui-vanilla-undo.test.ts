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
      if (/Model customization/i.test(String(opts.message ?? ""))) return "none"
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
  test("auto preset path skips per-agent selection and installs global route defaults", async () => {
    const prompts = (await import("@clack/prompts")) as any
    const calls: unknown[][] = prompts.__calls
    calls.length = 0
    installerMock.runLazycodexInstaller.mockClear()

    // select defaults to options[0] => "auto" for the global preset question.
    await tui.runSetupTui({}, { plan: {}, resolved: { discovery: discovery() } }, {
      prompts,
      colors: { inverse: (s: string) => s, green: (s: string) => s },
    })

    const modeSelect = calls.find((c) => c[0] === "select" && /Global model preset/.test(String(c[1])))
    const reasoningSelect = calls.find((c) => c[0] === "select" && /Global reasoning effort/.test(String(c[1])))
    expect(modeSelect).toBeTruthy()
    expect(reasoningSelect).toBeTruthy()

    // NO per-agent model/tier/reasoning selects in the vanilla path (exclude the mode question itself).
    const perAgentModelPrompts = calls.filter((c) => {
      const msg = String(c[1] ?? "")
      return (c[0] === "autocomplete" || c[0] === "select") &&
        /model|service tier|reasoning/i.test(msg) &&
        !/Global model preset/.test(msg) && !/Global reasoning effort/.test(msg) && !/Model customization/.test(msg)
    })
    expect(perAgentModelPrompts.length).toBe(0)

    const resultsNote = calls.find((c) => c[0] === "note" && /Setup results/.test(String(c[1])))
    const resultsBody = String(resultsNote?.[2] ?? "")
    expect(resultsBody).toContain("Preset: auto")
    expect(resultsBody).toContain("Agent routing is derived from the global preset")

    // Install Summary + install executed with Grok agent overrides.
    expect(calls.some((c) => c[0] === "note" && /Install Summary/.test(String(c[1])))).toBe(true)
    expect(installerMock.runLazycodexInstaller).toHaveBeenCalledTimes(1)
    const installed = (installerMock.runLazycodexInstaller.mock.calls as unknown as ReadonlyArray<readonly unknown[]>)[0]?.[0] as Record<string, any>
    // agentOverrideMap is no longer set on discovery; install path resolves per-agent overrides from bundled JSON.
    expect(installed?.agentConfig?.explorer?.model).toBe("grok-3-mini-fast")
  })

  test("vanilla preset preserves Grok-only named agent overrides", async () => {
    const prompts = (await import("@clack/prompts")) as any
    prompts.__calls.length = 0
    installerMock.runLazycodexInstaller.mockClear()

    const origSelect = prompts.select
    prompts.select = async (opts: any) => {
      const message = String(opts.message ?? "")
      if (/Global model preset/.test(message)) return "vanilla"
      if (/Global reasoning effort/.test(message)) return "auto"
      return String(opts.options?.[0]?.value ?? "auto")
    }

    await tui.runSetupTui({}, { plan: {}, resolved: { discovery: discovery() } }, {
      prompts,
      colors: { inverse: (s: string) => s, green: (s: string) => s },
    })

    prompts.select = origSelect

    const installed = (installerMock.runLazycodexInstaller.mock.calls as unknown as ReadonlyArray<readonly unknown[]>)[0]?.[0] as Record<string, any>
    expect(installed?.agentOverrideMap).toBeTruthy()
    for (const override of Object.values(installed.agentOverrideMap as Record<string, { model: string }>)) {
      expect(override.model).toMatch(/^grok[-_]/)
    }
  })

  test("auto preset works with no proxy by preserving existing model config", async () => {
    const prompts = (await import("@clack/prompts")) as any
    const calls: unknown[][] = prompts.__calls
    calls.length = 0
    installerMock.runLazycodexInstaller.mockClear()

    await tui.runSetupTui({}, { plan: {}, resolved: null }, {
      prompts,
      colors: { inverse: (s: string) => s, green: (s: string) => s },
    })

    expect(installerMock.runLazycodexInstaller).toHaveBeenCalledTimes(1)
    const installed = (installerMock.runLazycodexInstaller.mock.calls as unknown as ReadonlyArray<readonly unknown[]>)[0]?.[0]
    expect(installed).toBeNull()
  })

  test("global reasoning effort select applies to all derived role agents", async () => {
    const prompts = (await import("@clack/prompts")) as any
    prompts.__calls.length = 0
    installerMock.runLazycodexInstaller.mockClear()

    const origSelect = prompts.select
    prompts.select = async (opts: any) => {
      const message = String(opts.message ?? "")
      if (/Global model preset/.test(message)) return "balanced"
      if (/Global reasoning effort/.test(message)) return "xhigh"
      return String(opts.options?.[0]?.value ?? "auto")
    }

    await tui.runSetupTui({}, { plan: {}, resolved: { discovery: discovery() } }, {
      prompts,
      colors: { inverse: (s: string) => s, green: (s: string) => s },
    })

    prompts.select = origSelect

    const installed = (installerMock.runLazycodexInstaller.mock.calls as unknown as ReadonlyArray<readonly unknown[]>)[0]?.[0] as Record<string, any>
    expect(installed?.agentConfig?.explorer?.reasoningLevel).toBe("xhigh")
    expect(installed?.agentConfig?.reasoning?.reasoningLevel).toBe("xhigh")
    expect(installed?.agentConfig?.coding?.reasoningLevel).toBe("xhigh")
  })

  test("cancel on the global preset select aborts cleanly with no install", async () => {
    const prompts = (await import("@clack/prompts")) as any
    const calls: unknown[][] = prompts.__calls
    calls.length = 0
    installerMock.runLazycodexInstaller.mockClear()

    const CANCEL = Symbol.for("clack-cancel")
    const origSelect = prompts.select
    prompts.select = async (opts: any) => (/Global model preset/.test(String(opts.message ?? "")) ? CANCEL : String(opts.options?.[0]?.value ?? "auto"))

    await expect(
      tui.runSetupTui({}, { plan: {}, resolved: { discovery: discovery() } }, {
        prompts,
        colors: { inverse: (s: string) => s, green: (s: string) => s },
      }),
    ).rejects.toThrow(/cancelled/)

    prompts.select = origSelect

    expect(calls.some((c) => c[0] === "cancel")).toBe(true)
    expect(installerMock.runLazycodexInstaller).not.toHaveBeenCalled()
  })
})
