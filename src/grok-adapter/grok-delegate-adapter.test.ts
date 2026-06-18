import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { mkdtempSync } from "node:fs"

import { describe, expect, test } from "vitest"

import { buildGrokModelCatalog } from "./grok-model-adapter"
import {
  getGrokPlanChecklist,
  resolveGrokDelegatePlanPath,
  resolveModelForGrokDelegateTask,
  toggleGrokPlanChecklistItem,
} from "./grok-delegate-adapter"

describe("resolveModelForGrokDelegateTask", () => {
  test("returns the user model when set", () => {
    const catalog = buildGrokModelCatalog({ modelIds: ["grok-4", "grok-3-mini"] })

    const resolved = resolveModelForGrokDelegateTask({
      catalog,
      userModel: "xai/grok-3-mini",
      systemDefaultModel: "xai/grok-4",
    })

    expect(resolved).toEqual({ model: "xai/grok-3-mini" })
  })

  test("falls through to the Grok system default when nothing else resolves", () => {
    const catalog = buildGrokModelCatalog({ modelIds: [], connectedProviders: [] })

    const resolved = resolveModelForGrokDelegateTask({ catalog })

    expect(resolved).toEqual({ model: "xai/grok-4" })
  })

  test("uses the catalog available models for fuzzy matching", () => {
    const catalog = buildGrokModelCatalog({ modelIds: ["grok-4-0709", "grok-3-mini"] })

    const resolved = resolveModelForGrokDelegateTask({
      catalog,
      categoryDefaultModel: "xai/grok-4",
      systemDefaultModel: "xai/grok-3-mini",
    })

    expect(resolved).toEqual({ model: "xai/grok-4-0709" })
  })
})

describe("Grok boulder-state plan checklist bridge", () => {
  test("reads and toggles a plan checklist under the temp project's .omo/plans directory", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "lfg-grok-delegate-"))
    const plansDir = join(projectRoot, ".omo", "plans")
    mkdirSync(plansDir, { recursive: true })
    const planPath = join(plansDir, "phase-5.md")
    writeFileSync(
      planPath,
      [
        "# Phase 5",
        "",
        "## TODOs",
        "- [ ] 1. Wire delegate adapter",
        "- [x] 2. Keep existing behavior",
        "",
        "## Notes",
        "- [ ] Not counted",
        "",
      ].join("\n"),
      "utf-8",
    )

    expect(resolveGrokDelegatePlanPath({ projectRoot, planSlug: "phase-5" })).toBe(planPath)
    expect(getGrokPlanChecklist({ projectRoot, planSlug: "phase-5" })).toEqual({
      total: 2,
      completed: 1,
      remaining: 1,
      nextTaskLabel: "1. Wire delegate adapter",
    })

    const toggled = toggleGrokPlanChecklistItem({
      projectRoot,
      planSlug: "phase-5",
      label: "1. Wire delegate adapter",
      checked: true,
    })

    expect(toggled).toEqual({
      checklist: { total: 2, completed: 2, remaining: 0, nextTaskLabel: null },
      changed: true,
      planPath,
    })
    expect(readFileSync(planPath, "utf-8")).toContain("- [x] 1. Wire delegate adapter")
    expect(getGrokPlanChecklist({ projectRoot, planSlug: "phase-5" })).toEqual({
      total: 2,
      completed: 2,
      remaining: 0,
      nextTaskLabel: null,
    })
  })
})
