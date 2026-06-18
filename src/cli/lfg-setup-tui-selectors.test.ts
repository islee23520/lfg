import { describe, expect, test } from "vitest"

import { buildModelChoicesForTui } from "./lfg-setup-tui-selectors"

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
})
