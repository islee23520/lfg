import { describe, expect, test } from "bun:test"
import { createTempLfgState } from "../../../test-utils/temp-state"
import { boulderAddBlockerCommand, boulderAddEvidenceCommand, boulderSetGoalCommand, boulderStatusCommand } from "./boulder"

describe("runtime-ts boulder command", () => {
  test("persists current goal, evidence, and blockers", async () => {
    const state = await createTempLfgState()
    try {
      await boulderSetGoalCommand({ goal: "move the boulder" }, state.env, () => "2026-05-21T00:00:00Z")
      await boulderAddEvidenceCommand({ evidence: "spawn-envelope=ok", taskId: "1" }, state.env, () => "2026-05-21T00:00:01Z")
      await boulderAddBlockerCommand({ blocker: "none" }, state.env, () => "2026-05-21T00:00:02Z")
      const status = await boulderStatusCommand(state.env)
      expect(status).toMatchObject({ ok: true, operation: "boulder_status", state: { currentGoal: "move the boulder", evidence: [{ evidence: "spawn-envelope=ok" }], blockers: [{ reason: "none" }] } })
    } finally { await state.cleanup() }
  })
})
