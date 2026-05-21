import { describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { createTempLfgState } from "../../../test-utils/temp-state"
import { atlasCheckboxCommand, atlasStartWorkCommand, atlasStatusCommand } from "./atlas"
import { planCreateCommand } from "./plan"

describe("runtime-ts atlas command", () => {
  test("runs plan lifecycle start-work to checkbox", async () => {
    const state = await createTempLfgState()
    try {
      const plan = await planCreateCommand({ title: "atlas lifecycle", steps: "one;two" }, state.env, () => "2026-05-21T00:00:00Z")
      const started = await atlasStartWorkCommand({ planId: plan.id, sessionId: "atlas-test" }, state.env, () => "2026-05-21T00:00:01Z")
      expect(started).toMatchObject({ ok: true, operation: "atlas_start_work", planId: plan.id, progress: { total: 2, completed: 0, remaining: 2 } })
      expect(typeof started.boulderPath === "string" && existsSync(started.boulderPath)).toBe(true)
      const checked = await atlasCheckboxCommand({ planId: plan.id, task: 1, status: "complete", evidence: "verified" }, state.env, () => "2026-05-21T00:00:02Z")
      expect(checked).toMatchObject({ ok: true, operation: "atlas_checkbox_update", taskId: "1", progress: { total: 2, completed: 1, remaining: 1 } })
      const status = await atlasStatusCommand({ planId: plan.id }, state.env)
      expect(status).toMatchObject({ ok: true, operation: "atlas_status", progress: { completed: 1 } })
    } finally { await state.cleanup() }
  })
})
