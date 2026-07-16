import { describe, expect, test } from "vitest"
import { configureBackendRouting, fixedBackendRouting } from "./lfg-setup-tui-backends"

describe("setup CLI backend routing", () => {
  test("fixed routing is codex implementer and sisyphus on grok without prompts", async () => {
    const prompts = {
      select: async () => {
        throw new Error("setup must not prompt for backend")
      },
      confirm: async () => {
        throw new Error("setup must not prompt for backend")
      },
      isCancel: () => false,
      cancel: () => undefined,
    }
    const result = await configureBackendRouting(prompts)
    expect(result).toEqual(fixedBackendRouting())
    expect(result.global).toBe("codex")
    expect(result.agents.sisyphus).toBe("grok")
  })
})
