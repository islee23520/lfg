import { describe, expect, test, vi } from "vitest"
import type { PrereqReport } from "../../core/lfg/prereqs/codex-lazycodex"

const { runGrokInstall } = vi.hoisted(() => ({ runGrokInstall: vi.fn() }))

vi.mock("../../grok/install/run-grok-install", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../grok/install/run-grok-install")>()
  return { ...actual, runGrokInstall }
})

import { runLazycodexInstaller } from "./lfg-installer"

function missingCodexReport(): PrereqReport {
  const emptyRecipes = [] as const
  return {
    platform: "darwin",
    ok: false,
    missing: ["codex"],
    recommendedMissing: [],
    codex: { id: "codex", required: true, ok: false, status: "missing", binary: "codex", commandPath: null, detail: "missing", recipes: emptyRecipes },
    lazycodex: { id: "lazycodex", required: false, ok: false, status: "missing", binary: "lazycodex", commandPath: null, detail: "facade", recipes: emptyRecipes },
    gjc: { id: "gjc", required: false, ok: true, status: "ready", binary: "gjc", commandPath: "/bin/gjc", detail: "ready", recipes: emptyRecipes },
    agy: { id: "agy", required: false, ok: true, status: "ready", binary: "agy", commandPath: "/bin/agy", detail: "ready", recipes: emptyRecipes },
  }
}

describe("runLazycodexInstaller prerequisite gate", () => {
  test("fails closed before Grok installation when Codex is absent", async () => {
    // Given / When
    const result = await runLazycodexInstaller(null, {
      prereqProbe: async () => missingCodexReport(),
    })

    // Then
    expect(result.ok).toBe(false)
    expect(result.status).toBe("codex_required")
    expect(runGrokInstall).not.toHaveBeenCalled()
  })
})
