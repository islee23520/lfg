import { describe, expect, test } from "bun:test"
import { loadFixture } from "../../../test-utils/fixture-loader"
import { agentsInspect, agentsList, CANONICAL_OMO_AGENT_IDS, loadOmoAgentRegistry, validateTeamMemberEligibility } from "./agent-registry"

describe("runtime-ts agent registry", () => {
  test("loads all canonical OMO agents from src/agents", async () => {
    const fixture = await loadFixture<{ full_inventory_ids: string[]; primary_order: string[] }>("omo-agent-registry-contract.json")
    const agents = await loadOmoAgentRegistry()
    expect(agents.map((agent) => agent.id)).toEqual(fixture.full_inventory_ids)
    expect([...CANONICAL_OMO_AGENT_IDS] as string[]).toEqual(fixture.full_inventory_ids)
    expect(agents.filter((agent) => agent.primaryOrder).map((agent) => agent.id)).toEqual(fixture.primary_order)
  })

  test("lists, inspects, and rejects hard-reject team members", async () => {
    const list = await agentsList({ ids: true, json: true })
    expect(list.count).toBe(12)
    expect((await agentsInspect("sisyphus-junior")).ok).toBe(true)
    expect(validateTeamMemberEligibility("prometheus")).toMatchObject({ ok: false, teamEligibility: "hard-reject" })
  })
})
