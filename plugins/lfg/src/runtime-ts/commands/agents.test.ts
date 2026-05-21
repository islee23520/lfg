import { describe, expect, test } from "bun:test"
import { agentsInspect, agentsList } from "./agents"

describe("runtime-ts agents command", () => {
  test("lists and inspects canonical agents with model resolution", async () => {
    const list = await agentsList({ json: true })
    expect(list).toMatchObject({ ok: true, status: "ok", count: 12 })
    const inspect = await agentsInspect({ agentId: "sisyphus-junior", category: "quick" })
    expect(inspect).toMatchObject({ ok: true, resolvedModelProfile: { provider: "xai", reasoning: "low" } })
  })
})
