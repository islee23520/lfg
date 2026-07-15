import { describe, expect, test } from "vitest"
import { ensureCodexLazyCodexPrereqsInTui, formatPrereqNote } from "./lfg-setup-tui-prereqs"
import type { PrereqReport } from "../../core/lfg/prereqs/codex-lazycodex"

function missingReport(): PrereqReport {
  return {
    platform: "darwin",
    ok: false,
    missing: ["codex"],
    recommendedMissing: ["gjc", "agy"],
    codex: {
      id: "codex",
      required: false,
      ok: false,
      status: "missing",
      binary: "codex",
      commandPath: null,
      detail: "missing codex",
      recipes: [
        {
          id: "codex-curl",
          label: "curl",
          command: "sh",
          args: ["-c", "true"],
          shellHint: "curl -fsSL https://chatgpt.com/codex/install.sh | sh",
          docsUrl: "https://github.com/openai/codex",
        },
      ],
    },
    lazycodex: {
      id: "lazycodex",
      required: true,
      ok: false,
      status: "missing",
      binary: "lazycodex-ai",
      commandPath: null,
      detail: "missing lazycodex",
      recipes: [],
    },
    gjc: {
      id: "gjc",
      required: false,
      ok: false,
      status: "missing",
      binary: "gjc",
      commandPath: null,
      detail: "missing gjc",
      recipes: [
        {
          id: "gjc-bun",
          label: "bun",
          command: "bun",
          args: ["install", "-g", "@gajae-code/coding-agent"],
          shellHint: "bun install -g @gajae-code/coding-agent",
          docsUrl: "https://www.npmjs.com/package/@gajae-code/coding-agent",
        },
      ],
    },
    agy: {
      id: "agy",
      required: false,
      ok: false,
      status: "missing",
      binary: "agy",
      commandPath: null,
      detail: "missing agy",
      recipes: [],
    },
  }
}

function readyReport(): PrereqReport {
  const base = missingReport()
  return {
    ...base,
    ok: true,
    missing: [],
    recommendedMissing: [],
    codex: { ...base.codex, ok: true, status: "ready", commandPath: "/bin/codex", detail: "ready" },
    lazycodex: { ...base.lazycodex, ok: true, status: "ready", detail: "ready" },
    gjc: { ...base.gjc, ok: true, status: "ready", commandPath: "/bin/gjc", detail: "ready" },
    agy: { ...base.agy, ok: true, status: "ready", commandPath: "/bin/agy", detail: "ready" },
  }
}

describe("lfg-setup-tui-prereqs", () => {
  test("formatPrereqNote lists platform and missing tools", () => {
    const text = formatPrereqNote(missingReport())
    expect(text).toContain("Platform: darwin")
    expect(text).toContain("Missing: codex")
    expect(text).toContain("Recommended missing: gjc, agy")
  })

  test("formatPrereqNote describes Codex as the only required implementation prerequisite", () => {
    // Given
    const report = missingReport()

    // When
    const text = formatPrereqNote(report)

    // Then
    expect(text).toContain("Codex:")
    expect(text).not.toContain("LazyCodex")
    expect(text).not.toContain("facade")
  })

  test("ready probe short-circuits with progress steps", async () => {
    const notes: string[] = []
    const progress: string[] = []
    const result = await ensureCodexLazyCodexPrereqsInTui({
      prompts: {
        note: (m, t) => {
          notes.push(`${t ?? ""}:${m}`)
        },
        confirm: async () => true,
        isCancel: () => false,
        cancel: () => {},
        spinner: () => ({
          start: (m) => progress.push(`start:${m ?? ""}`),
          message: (m) => progress.push(`message:${m ?? ""}`),
          stop: (m) => progress.push(`stop:${m ?? ""}`),
        }),
        log: { step: (m) => progress.push(`step:${m}`) },
      },
      probe: async () => readyReport(),
    })
    expect(result.ok).toBe(true)
    expect(result.status).toBe("ready")
    expect(progress.some((p) => p.includes("Step 1/6"))).toBe(true)
    expect(notes.some((n) => /prerequisites/i.test(n))).toBe(true)
  })

  test("missing tools offer install and re-check with top-layer progress", async () => {
    let probeCount = 0
    const progress: string[] = []
    const confirms: string[] = []
    const result = await ensureCodexLazyCodexPrereqsInTui({
      prompts: {
        note: () => {},
        confirm: async (opts) => {
          confirms.push(String(opts.message))
          return true
        },
        select: async (opts) => opts.initialValue ?? opts.options[0]?.value,
        isCancel: () => false,
        cancel: () => {},
        spinner: () => ({
          start: (m) => progress.push(`start:${m ?? ""}`),
          message: (m) => progress.push(`message:${m ?? ""}`),
          stop: (m) => progress.push(`stop:${m ?? ""}`),
        }),
        log: {
          step: (m) => progress.push(`step:${m}`),
          success: (m) => progress.push(`success:${m}`),
        },
      },
      probe: async () => {
        probeCount += 1
        return probeCount >= 2 ? readyReport() : missingReport()
      },
      installRunner: async (recipe) => ({
        ok: true,
        tool: recipe.id.startsWith("codex") ? "codex" : recipe.id.startsWith("lazycodex") ? "lazycodex" : "gjc",
        recipeId: recipe.id,
        command: recipe.command,
        args: recipe.args,
        stdout: "ok",
        stderr: "",
      }),
    })
    expect(result.ok).toBe(true)
    expect(result.installs).toHaveLength(1)
    expect(confirms.some((c) => /Codex CLI/i.test(c))).toBe(true)
    expect(confirms.some((c) => /LazyCodex/i.test(c))).toBe(false)
    expect(progress.some((p) => /Step 2\/6/.test(p))).toBe(true)
    expect(progress.some((p) => /Step 3\/6/.test(p))).toBe(true)
    expect(progress.some((p) => /Step 4\/6/.test(p))).toBe(true)
    expect(progress.some((p) => /Step 5\/6/.test(p))).toBe(true)
    expect(progress.some((p) => /Step 6\/6/.test(p))).toBe(true)
  })

  test("still missing after decline fails closed", async () => {
    const result = await ensureCodexLazyCodexPrereqsInTui({
      prompts: {
        note: () => {},
        confirm: async () => false,
        isCancel: () => false,
        cancel: () => {},
        spinner: () => ({
          start: () => {},
          message: () => {},
          stop: () => {},
        }),
      },
      probe: async () => missingReport(),
    })
    expect(result.ok).toBe(false)
    expect(result.status).toBe("still_missing")
  })
})
