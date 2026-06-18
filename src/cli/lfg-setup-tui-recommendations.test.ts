import { describe, expect, test, vi } from "vitest"

vi.mock("@clack/prompts", () => {
  const calls: unknown[][] = []
  const prompts = {
    intro: (m: string) => calls.push(["intro", m]),
    note: (m: string, title?: string) => calls.push(["note", title, m]),
    confirm: async (opts: { readonly message?: string }) => {
      calls.push(["confirm", opts.message])
      return !/Install now\?|Core \+ ULW/i.test(String(opts.message ?? ""))
    },
    select: async (opts: { readonly message?: string; readonly options?: readonly { readonly value: string }[] }) => {
      // Exercise the proxy (discovery-based) path: pick cli-proxy at the Model setup question.
      if (/Model setup/i.test(String(opts.message ?? ""))) return "proxy";
      return opts.options?.[0]?.value ?? "grok-3-mini-fast";
    },
    autocomplete: async (opts: { readonly message?: string; readonly options?: readonly { readonly value: string }[]; readonly initialValue?: string }) => {
      calls.push(["autocomplete", opts.message, opts.options?.length, opts.initialValue, opts.options])
      return opts.initialValue ?? opts.options?.[0]?.value ?? "grok-3-mini-fast"
    },
    isCancel: (v: unknown) => v === Symbol.for("clack-cancel"),
    cancel: (m: string) => calls.push(["cancel", m]),
    outro: (m: string) => calls.push(["outro", m]),
  }
  return { ...prompts, __calls: calls, default: prompts }
})

vi.mock("picocolors", () => ({
  default: {
    inverse: (s: string) => s,
    green: (s: string) => s,
  },
}))

vi.mock("./lfg-installer.js", () => ({
  runLazycodexInstaller: vi.fn(async () => ({ ok: true, stdout: "", stderr: "" })),
}))

import * as tui from "./lfg-setup-tui"

describe("lfg-setup-tui recommendations", () => {
  test("TUI model selector offers only discovered models and uses OMO override recommendations", async () => {
    const prompts = await import("@clack/prompts") as typeof import("@clack/prompts") & { readonly __calls: unknown[][] }
    const calls = prompts.__calls
    calls.length = 0

    await tui.runSetupTui(
      {},
      {
        plan: {},
        resolved: {
          discovery: {
            baseUrl: "http://127.0.0.1:8317/v1",
            modelsUrl: "http://127.0.0.1:8317/v1/models",
            modelIds: ["grok-3-mini-fast", "grok-4.20-0309-reasoning"],
            mapping: {
              default: "missing-default-model",
              fast: "grok-3-mini-fast",
              reasoning: "missing-reasoning-model",
              coding: "missing-coding-model",
            },
          },
        },
      },
      {
        prompts,
        colors: { inverse: (s: string) => s, green: (s: string) => s },
      },
    )

    const explorerRec = calls.find((c) => c[0] === "note" && /explorer model recommendation/.test(String(c[1])))
    expect(String(explorerRec?.[2] ?? "")).toContain("Recommended: grok-3-mini-fast (low)")
    expect(String(explorerRec?.[2] ?? "")).toContain("Fallback chain: gpt-5.4-mini → grok-3-mini-fast")

    const modelPrompts = calls.filter((c) => c[0] === "autocomplete")
    expect(modelPrompts.length).toBeGreaterThan(0)
    for (const call of modelPrompts) {
      const options = Array.isArray(call[4]) ? call[4] : []
      expect(options.map((option: { readonly value?: string }) => option.value)).toEqual(["grok-3-mini-fast", "grok-4.20-0309-reasoning"])
      expect(options.some((option: { readonly value?: string }) => /missing-|gpt-5\.4-mini|gpt-5\.5|gpt-5\.3-codex/.test(String(option.value)))).toBe(false)
    }
  })
})
