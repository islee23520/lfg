import { describe, expect, test, beforeEach, afterEach } from "vitest"
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  resolveTeamsRoot,
  createTeam,
  addMemberSlot,
  recordSpawnMetadata,
  appendMessage,
  listTeams,
  getStatus,
  requestShutdown,
  type TeamStatus,
} from "./team-ledger"

describe("team-ledger (Grok-native team MVP)", () => {
  let tempRoot: string
  let teamsRoot: string
  let teamId: string

  beforeEach(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "lfg-team-test-"))
    teamsRoot = await resolveTeamsRoot(tempRoot) // uses project .omo/teams under temp
  })

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true }).catch(() => {})
  })

  test("create → add 2 members → record spawn → append message → status; missing member fails closed", async () => {
    // create
    teamId = await createTeam(teamsRoot, "test-team", "MVP test team for Grok spawn_subagent members")
    expect(teamId).toMatch(/^team-/)

    // add 2 members
    const member1 = await addMemberSlot(teamsRoot, teamId, {
      id: "m01",
      name: "coder",
      focus: "implementation slice",
      kind: "subagent_type",
      subagent_type: "hephaestus",
      deliverable: "complete the code changes",
    })
    expect(member1.id).toBe("m01")
    expect(member1.spawnMetadata).toBeUndefined()

    const member2 = await addMemberSlot(teamsRoot, teamId, {
      focus: "verification slice",
      kind: "category",
      category: "quick",
      name: "verifier",
    })
    expect(member2.id).toBe("m02")
    expect(member2.kind).toBe("category")

    // record spawn metadata for member1 (simulates spawn_subagent success)
    await recordSpawnMetadata(teamsRoot, teamId, "m01", {
      subagentId: "sub-123",
      spawnTime: new Date().toISOString(),
      promptHash: "abc123",
    })

    // append message (lead to member, simulates mailbox)
    await appendMessage(teamsRoot, teamId, "lead", "m01", "Please implement the team_create flow using spawn_subagent with team_context.")
    await appendMessage(teamsRoot, teamId, "m01", "lead", "Acknowledged. Spawn metadata recorded. Working on it.")

    // list and status
    const listed: TeamStatus[] = await listTeams(teamsRoot)
    expect(listed.length).toBeGreaterThanOrEqual(1)
    expect(listed.some((t) => t.id === teamId)).toBe(true)

    const status = await getStatus(teamsRoot, teamId)
    expect(status.config.name).toBe("test-team")
    expect(status.config.members.length).toBe(2)
    expect(status.config.members[0].spawnMetadata?.subagentId).toBe("sub-123")
    expect(status.state.messages.length).toBe(2)
    expect(status.state.status).toBe("active")
    expect(status.guideExists).toBe(true)

    // shutdown request
    await requestShutdown(teamsRoot, teamId)
    const shutdownStatus = await getStatus(teamsRoot, teamId)
    expect(shutdownStatus.state.status).toBe("shutdown_requested")

    // test missing member fails closed
    await expect(
      recordSpawnMetadata(teamsRoot, teamId, "missing-m99", { foo: "bar" })
    ).rejects.toThrow(/Missing member id missing-m99/)
  })

  test("listTeams returns empty for no teams", async () => {
    const emptyRoot = await mkdtemp(join(tmpdir(), "lfg-empty-team-test-"))
    try {
      const listed = await listTeams(join(emptyRoot, ".omo", "teams"))
      expect(listed).toEqual([])
    } finally {
      await rm(emptyRoot, { recursive: true, force: true }).catch(() => {})
    }
  })
})
