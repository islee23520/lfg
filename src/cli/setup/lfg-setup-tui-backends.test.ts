import { describe, expect, test, vi } from "vitest"
import { defaultBackendRoutingConfig } from "../../core/lfg/backend-routing"
import { configureBackendRouting } from "./lfg-setup-tui-backends"

describe("setup CLI backend routing editor", () => {
  test("edits each slim native agent without offering zoo routes", async () => {
    const selections = ["grok", "grok", "grok", "grok", "grok"]
    const selectMessages: string[] = []
    const prompts = {
      select: vi.fn(async (options: { readonly message: string }) => {
        selectMessages.push(options.message)
        return selections.shift() ?? "__done"
      }),
      confirm: vi.fn(async () => true),
      isCancel: (value: unknown) => typeof value === "symbol",
      cancel: vi.fn(),
    }

    const result = await configureBackendRouting(prompts, defaultBackendRoutingConfig())

    expect(result.categories).toEqual({})
    expect(result.agents).toEqual({
      sisyphus: "grok",
      watcher: "grok",
      explorer: "grok",
      "git-master": "grok",
    })
    expect(prompts.select).toHaveBeenCalledTimes(5)
    expect(selectMessages).toEqual([
      "Default CLI backend for agents",
      "CLI backend for sisyphus",
      "CLI backend for watcher",
      "CLI backend for explorer",
      "CLI backend for git-master",
    ])
    expect(prompts.cancel).not.toHaveBeenCalled()
  })

  test("offers both backends for every remaining native agent", async () => {
    const optionValues: Record<string, readonly string[]> = {}
    const prompts = {
      select: vi.fn(async (options: { readonly message: string; readonly options: readonly { readonly value: string }[] }) => {
        optionValues[options.message] = options.options.map((option) => option.value)
        return "grok"
      }),
      confirm: vi.fn(async () => true),
      isCancel: (value: unknown) => typeof value === "symbol",
      cancel: vi.fn(),
    }

    await configureBackendRouting(prompts, defaultBackendRoutingConfig())

    expect(optionValues["CLI backend for sisyphus"]).toEqual(["grok", "codex"])
    expect(optionValues["CLI backend for git-master"]).toEqual(["grok", "codex"])
  })
})
