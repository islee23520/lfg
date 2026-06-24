import { describe, expect, test } from "vitest"

import { buildModelChoicesForTui, createSetupSelectors } from "./lfg-setup-tui-selectors"

describe("lfg setup TUI selectors", () => {
  test("model choices are searchable chat models sorted by label", () => {
    const choices = buildModelChoicesForTui([
      "gpt-image-2",
      "grok-4.20-0309-reasoning",
      "text-embedding-3-large",
      "gpt-5.5",
      "openai/gpt-5.5",
      "audio-transcribe-v1",
      "grok-3-mini-fast",
    ])

    expect(choices.map((choice) => choice.label)).toEqual([
      "gpt-5.5 (aliases: gpt-5.5, openai/gpt-5.5)",
      "grok-3-mini-fast",
      "grok-4.20-0309-reasoning",
    ])
    expect(choices.some((choice) => /image|embedding|audio/.test(choice.value))).toBe(false)
  })

  test("model selector message pins the recommendation so it stays visible above the list", async () => {
    const seen: string[] = []
    const fakePrompts = {
      autocomplete: async (opts: { readonly message?: string; readonly options?: readonly { readonly value?: string }[]; readonly initialValue?: string }) => {
        seen.push(String(opts.message ?? ""))
        return String(opts.initialValue ?? opts.options?.[0]?.value ?? "grok-3-mini-fast")
      },
      select: async () => "grok-3-mini-fast",
      isCancel: () => false,
      cancel: () => {},
    }
    const selectors = createSetupSelectors(fakePrompts as never)
    const choices = buildModelChoicesForTui(["grok-3-mini-fast", "grok-4.20-0309-reasoning"])

    await selectors.modelSelector({ agentName: "explorer", current: "grok-3-mini-fast", recommended: "grok-3-mini-fast", choices })

    expect(seen.length).toBe(1)
    expect(seen[0]).toMatch(/explorer model/)
    expect(seen[0]).toMatch(/recommended: grok-3-mini-fast/)
  })

  test("model selector message degrades cleanly when there is no recommendation (no 'undefined')", async () => {
    const seen: string[] = []
    const fakePrompts = {
      autocomplete: async (opts: { readonly message?: string; readonly options?: readonly { readonly value?: string }[]; readonly initialValue?: string }) => {
        seen.push(String(opts.message ?? ""))
        return String(opts.initialValue ?? opts.options?.[0]?.value ?? "grok-3-mini-fast")
      },
      select: async () => "grok-3-mini-fast",
      isCancel: () => false,
      cancel: () => {},
    }
    const selectors = createSetupSelectors(fakePrompts as never)
    const choices = buildModelChoicesForTui(["grok-3-mini-fast"])

    await selectors.modelSelector({ agentName: "plan", current: "grok-3-mini-fast", choices })

    expect(seen.length).toBe(1)
    expect(seen[0]).toMatch(/plan model/)
    expect(seen[0]).not.toMatch(/undefined/)
    expect(seen[0]).not.toMatch(/recommended:/)
  })
})
