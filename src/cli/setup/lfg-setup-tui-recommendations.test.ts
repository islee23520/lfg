import { describe, expect, test, vi } from "vitest"

vi.mock("@clack/prompts", () => {
  const calls: unknown[][] = []
  const prompts = {
    intro: (m: string) => calls.push(["intro", m]),
    note: (m: string, title?: string) => calls.push(["note", title, m]),
    confirm: async (opts: { readonly message?: string }) => {
      calls.push(["confirm", opts.message])
      return !/Install now\?|Core \+ ULW|Modify recommended model settings/i.test(String(opts.message ?? ""))
    },
    select: async (opts: { readonly message?: string; readonly options?: readonly { readonly value: string }[] }) => {
      if (/Global model preset/i.test(String(opts.message ?? ""))) return "grok";
      if (/Global reasoning effort/i.test(String(opts.message ?? ""))) return "auto";
      if (/Model customization/i.test(String(opts.message ?? ""))) return "none";
      return opts.options?.[0]?.value ?? "auto";
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
  test("TUI global preset derives only discovered models without per-agent selectors", async () => {
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

    const modelPrompts = calls.filter((c) => c[0] === "autocomplete")
    expect(modelPrompts).toHaveLength(0)
    const resultsNote = calls.find((c) => c[0] === "note" && /Setup results/.test(String(c[1])))
    const results = String(resultsNote?.[2] ?? "")
    expect(results).toContain("LLM recommendation: auto")
    expect(results).toContain("grok-3-mini-fast")
    expect(results).toContain("grok-4.20-0309-reasoning")
    expect(results).not.toContain("missing-default-model")
    expect(results).not.toContain("missing-reasoning-model")
  })
})
