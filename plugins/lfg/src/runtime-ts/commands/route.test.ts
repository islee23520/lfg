import { describe, expect, test } from "bun:test"
import { createTempLfgState } from "../../../test-utils/temp-state"
import { routeCommand } from "./route"

describe("runtime-ts route command", () => {
  test("routes categories to Sisyphus-Junior with model profile", async () => {
    const state = await createTempLfgState()
    try {
      const result = await routeCommand({ category: "quick", task: "bounded task" }, state.env)
      expect(result).toMatchObject({ ok: true, status: "ok", routeKind: "category", category: "quick", selectedAgent: { id: "sisyphus-junior" }, modelProfile: { provider: "xai", model: "xai/grok-4.3", reasoning: "low" } })
    } finally { await state.cleanup() }
  })
})
