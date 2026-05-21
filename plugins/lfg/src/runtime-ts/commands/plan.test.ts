import { describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { createTempLfgState } from "../../../test-utils/temp-state"
import { planCreateCommand, planListCommand } from "./plan"

describe("runtime-ts plan command", () => {
  test("creates JSON and markdown plan artifacts and lists them", async () => {
    const state = await createTempLfgState()
    try {
      const plan = await planCreateCommand({ title: "ship TS commands", steps: "inspect;implement;verify" }, state.env, () => "2026-05-21T00:00:00Z")
      expect(plan.title).toBe("ship TS commands")
      expect(plan.status).toBe("active")
      expect(plan.steps[0]).toMatchObject({ id: 1, status: "pending", text: "inspect" })
      expect(plan.json_path && existsSync(plan.json_path)).toBe(true)
      expect(plan.markdown_path && existsSync(plan.markdown_path)).toBe(true)
      const listed = await planListCommand({}, state.env)
      expect(listed.count).toBe(1)
      expect(listed.plans[0]?.id).toBe(plan.id)
    } finally { await state.cleanup() }
  })
})
