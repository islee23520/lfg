import { describe, expect, test, beforeEach, afterEach } from "vitest"
import { mkdtemp, rm, readFile, writeFile, access } from "node:fs/promises"
import { join, dirname } from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
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
import { lfgSubagentForOmoSpawnType } from "./subagents/omo-spawn-map"
import { z } from "zod"

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..")
const TEAMMODE_SKILL_MD = join(REPO_ROOT, "skills/teammode/SKILL.md")

/** Grok spawn_subagent-shaped payload as recorded after a successful launch. */
function spawnSubagentShapedMetadata(args: {
  teamRunId: string
  memberId: string
  omoSpawnType: string
  description: string
  prompt: string
  subagentId: string
}) {
  const subagent_type = lfgSubagentForOmoSpawnType(args.omoSpawnType)
  return {
    // Host tool contract (spawn_subagent args + result handle)
    tool: "spawn_subagent" as const,
    args: {
      subagent_type,
      background: true,
      description: args.description,
      prompt: args.prompt,
      team_context: {
        teamRunId: args.teamRunId,
        memberId: args.memberId,
        role: "member" as const,
      },
    },
    result: {
      subagentId: args.subagentId,
      ok: true,
    },
    // Flat convenience fields (skill documents subagentId on recordSpawnMetadata)
    subagentId: args.subagentId,
    subagent_type,
    background: true,
    team_context: {
      teamRunId: args.teamRunId,
      memberId: args.memberId,
      role: "member" as const,
    },
  }
}
// spawn_metadata is a free-form persisted blob; narrow only the nested fields these
// assertions read through a focused Zod view (no `any`, no inline cast access).
const SpawnMetaView = z
  .object({
    args: z.object({ subagent_type: z.string() }).passthrough().optional(),
    result: z.object({ phase: z.string().optional() }).passthrough().optional(),
  })
  .passthrough()

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

  /**
   * T6 e2e: full ledger lifecycle beyond the basic sequence.
   * Proves durable on-disk layout, spawn_subagent-shaped metadata for both
   * members, mailbox (directed + broadcast), listTeams counts, graceful then
   * force shutdown, and fail-closed missing memberId — without expanding the
   * public API surface.
   */
  test("e2e full lifecycle: createTeam → addMemberSlot×2 → spawn_subagent metadata → appendMessage → list/getStatus → requestShutdown; missing memberId fails closed", async () => {
    const teamName = "refactor-squad-e2e"
    const description = "T6 full team-ledger lifecycle with spawn_subagent-shaped metadata"

    // 1) createTeam
    teamId = await createTeam(teamsRoot, teamName, description)
    expect(teamId).toMatch(/^team-[a-z0-9]+-[a-f0-9]{8}$/i)

    const teamDir = join(teamsRoot, teamId)
    // Durable layout: config, state, guide, mailbox/, tasks/, artifacts/
    for (const rel of ["config.json", "state.json", "guide.md", "mailbox", "tasks", "artifacts"]) {
      await expect(access(join(teamDir, rel))).resolves.toBeUndefined()
    }

    const configOnDisk = JSON.parse(await readFile(join(teamDir, "config.json"), "utf8"))
    expect(configOnDisk).toMatchObject({
      id: teamId,
      name: teamName,
      description,
      lead: { kind: "main-session" },
      members: [],
      schemaVersion: 1,
    })
    expect(configOnDisk.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)

    const stateOnDisk = JSON.parse(await readFile(join(teamDir, "state.json"), "utf8"))
    expect(stateOnDisk).toMatchObject({
      status: "active",
      messages: [],
      schemaVersion: 1,
    })

    const guide = await readFile(join(teamDir, "guide.md"), "utf8")
    expect(guide).toContain("spawn_subagent")
    expect(guide).toContain(teamId)
    expect(guide).toContain("team-ledger")

    // 2) addMemberSlot × 2 (implementation + verification slices)
    const m01 = await addMemberSlot(teamsRoot, teamId, {
      id: "m01",
      name: "impl-slice",
      focus: "implementation slice under src/core/lfg",
      kind: "subagent_type",
      subagent_type: "hephaestus",
      deliverable: "ship ledger-backed team create flow",
    })
    const m02 = await addMemberSlot(teamsRoot, teamId, {
      id: "m02",
      name: "verify-slice",
      focus: "verification slice — e2e tests + fail-closed paths",
      kind: "subagent_type",
      subagent_type: "sisyphus",
      deliverable: "GREEN vitest for full lifecycle",
    })
    expect(m01.id).toBe("m01")
    expect(m02.id).toBe("m02")
    expect(m01.subagent_type).toBe("hephaestus")
    expect(m02.subagent_type).toBe("sisyphus")
    expect(m01.spawnMetadata).toBeUndefined()
    expect(m02.spawnMetadata).toBeUndefined()

    // Duplicate member id fails closed (no silent overwrite)
    await expect(
      addMemberSlot(teamsRoot, teamId, {
        id: "m01",
        focus: "duplicate should fail",
      })
    ).rejects.toThrow(/already exists/)

    // 3) recordSpawnMetadata with spawn_subagent-shaped payloads for both members
    const spawnM01 = spawnSubagentShapedMetadata({
      teamRunId: teamId,
      memberId: "m01",
      omoSpawnType: "hephaestus",
      description: "team member m01: owns the implementation slice",
      prompt:
        "FIRST: read your guide.md at .omo/teams/.../guide.md and team state. Own ONLY your focus. Report via appendMessage or team_context callback. Use team_context.teamRunId and memberId.",
      subagentId: "subagent-impl-001",
    })
    const spawnM02 = spawnSubagentShapedMetadata({
      teamRunId: teamId,
      memberId: "m02",
      omoSpawnType: "sisyphus",
      description: "team member m02: owns the verification slice",
      prompt:
        "FIRST: read guide.md. Own verification only. Report via appendMessage with team_context.",
      subagentId: "subagent-verify-002",
    })

    await recordSpawnMetadata(teamsRoot, teamId, "m01", spawnM01)
    await recordSpawnMetadata(teamsRoot, teamId, "m02", spawnM02)

    // Merge / overlay: second record keeps prior keys and adds recordedAt
    await recordSpawnMetadata(teamsRoot, teamId, "m01", {
      lastHeartbeat: "hb-1",
      result: { subagentId: "subagent-impl-001", ok: true, phase: "running" },
    })

    // 4) appendMessage — directed lead↔member + broadcast
    await appendMessage(
      teamsRoot,
      teamId,
      "lead",
      "m01",
      "Implement createTeam durable layout; use spawn_subagent team_context only."
    )
    await appendMessage(teamsRoot, teamId, "m01", "lead", "WORKING: config.json + state.json written.")
    await appendMessage(teamsRoot, teamId, "m02", "lead", "WORKING: e2e scaffold in progress.")
    await appendMessage(teamsRoot, teamId, "lead", "*", "Broadcast: freeze API surface; tests only.")
    await appendMessage(teamsRoot, teamId, "m01", "m02", "Peer: impl ready for your verify slice.")

    // 5) listTeams / getStatus
    const listed = await listTeams(teamsRoot)
    const row = listed.find((t) => t.id === teamId)
    expect(row).toBeDefined()
    expect(row!.name).toBe(teamName)
    expect(row!.status).toBe("active")
    expect(row!.memberCount).toBe(2)
    expect(row!.unreadMessages).toBe(5)
    expect(row!.lastActivity).toMatch(/^\d{4}-\d{2}-\d{2}T/)

    const status = await getStatus(teamsRoot, teamId)
    expect(status.guideExists).toBe(true)
    expect(status.config.lead).toEqual({ kind: "main-session" })
    expect(status.config.members).toHaveLength(2)
    expect(status.state.status).toBe("active")
    expect(status.state.messages).toHaveLength(5)

    const member1 = status.config.members.find((m) => m.id === "m01")!
    const member2 = status.config.members.find((m) => m.id === "m02")!
    expect(member1.spawnMetadata?.tool).toBe("spawn_subagent")
    expect(member1.spawnMetadata?.args).toMatchObject({
      subagent_type: "hephaestus",
      background: true,
      team_context: { teamRunId: teamId, memberId: "m01", role: "member" },
    })
    expect(member1.spawnMetadata?.subagentId).toBe("subagent-impl-001")
    expect(member1.spawnMetadata?.lastHeartbeat).toBe("hb-1")
    expect(SpawnMetaView.parse(member1.spawnMetadata ?? {}).result?.phase).toBe("running")
    expect(member1.spawnMetadata?.recordedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)

    expect(member2.spawnMetadata?.tool).toBe("spawn_subagent")
    expect(SpawnMetaView.parse(member2.spawnMetadata ?? {}).args?.subagent_type).toBe("sisyphus")
    expect(member2.spawnMetadata?.team_context).toEqual({
      teamRunId: teamId,
      memberId: "m02",
      role: "member",
    })
    expect(member2.spawnMetadata?.subagentId).toBe("subagent-verify-002")

    // Message shape + broadcast default
    const broadcast = status.state.messages.find((m) => m.content.startsWith("Broadcast:"))
    expect(broadcast).toMatchObject({ from: "lead", to: "*" })
    expect(broadcast!.id).toBeTruthy()
    expect(broadcast!.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)

    const peer = status.state.messages.find((m) => m.from === "m01" && m.to === "m02")
    expect(peer?.content).toContain("Peer:")

    // On-disk config mirrors spawn metadata (atomic write path)
    const configAfter = JSON.parse(await readFile(join(teamDir, "config.json"), "utf8"))
    expect(configAfter.members[0].spawnMetadata.subagentId).toBe("subagent-impl-001")
    expect(configAfter.members[1].spawnMetadata.args.team_context.memberId).toBe("m02")

    // 6) requestShutdown (graceful → shutdown_requested + lead broadcast message)
    await requestShutdown(teamsRoot, teamId)
    const afterGraceful = await getStatus(teamsRoot, teamId)
    expect(afterGraceful.state.status).toBe("shutdown_requested")
    expect(
      afterGraceful.state.messages.some(
        (m) => m.from === "lead" && m.to === "*" && /Shutdown requested/i.test(m.content)
      )
    ).toBe(true)

    // listTeams reflects shutdown_requested
    const listedAfter = await listTeams(teamsRoot)
    expect(listedAfter.find((t) => t.id === teamId)?.status).toBe("shutdown_requested")

    // force → archived
    await requestShutdown(teamsRoot, teamId, true)
    const afterForce = await getStatus(teamsRoot, teamId)
    expect(afterForce.state.status).toBe("archived")
    expect(listedAfter.find((t) => t.id === teamId)).toBeDefined() // prior snapshot unchanged
    const listedArchived = await listTeams(teamsRoot)
    expect(listedArchived.find((t) => t.id === teamId)?.status).toBe("archived")

    // 7) missing memberId fails closed (no silent create)
    await expect(
      recordSpawnMetadata(teamsRoot, teamId, "missing-m99", {
        tool: "spawn_subagent",
        subagentId: "should-not-land",
      })
    ).rejects.toThrow(/Missing member id missing-m99.*fails closed/)

    // Unknown team fails closed
    await expect(getStatus(teamsRoot, "team-does-not-exist")).rejects.toThrow(/Team not found/)
    await expect(
      addMemberSlot(teamsRoot, "team-does-not-exist", { focus: "x" })
    ).rejects.toThrow(/Team not found/)
    await expect(
      appendMessage(teamsRoot, "team-does-not-exist", "lead", "m01", "nope")
    ).rejects.toThrow(/Team not found/)
    await expect(requestShutdown(teamsRoot, "team-does-not-exist")).rejects.toThrow(
      /Team not found/
    )

    // Invalid teamId rejected before FS walk
    await expect(createTeam(teamsRoot, "ok")).resolves.toBeTruthy() // sanity still works
    await expect(getStatus(teamsRoot, "../escape")).rejects.toThrow(/Invalid teamId/)
  })

  test("skill contract: teammode GrokBuild section lists the same ledger API names", async () => {
    const skillMd = await readFile(TEAMMODE_SKILL_MD, "utf8")
    expect(skillMd).toContain("## GrokBuild teammode (primary on lfg)")
    expect(skillMd).toContain("src/core/lfg/team-ledger.ts")

    // Public ledger surface documented in skill must match exports under test
    const requiredApiNames = [
      "createTeam",
      "addMemberSlot",
      "recordSpawnMetadata",
      "appendMessage",
      "listTeams",
      "getStatus",
      "requestShutdown",
    ] as const
    for (const name of requiredApiNames) {
      expect(skillMd, `skills/teammode/SKILL.md must document ${name}`).toContain(name)
    }

    // spawn_subagent-shaped contract phrases; Grok path forbids required codex_app tools
    expect(skillMd).toMatch(/spawn_subagent\s*\(/)
    expect(skillMd).toContain("team_context")
    expect(skillMd).toContain("Fails closed")
    expect(skillMd).toMatch(/Grok-adapted/i)
    const grokSection = skillMd.slice(
      skillMd.indexOf("## GrokBuild teammode (primary on lfg)"),
      skillMd.indexOf("## When to use a team")
    )
    // Section explicitly bans codex_app on the Grok member-launch path
    expect(grokSection).toMatch(/NO codex_app/i)
    expect(grokSection).toContain("spawn_subagent")
  })
  test("concurrent appendMessage calls never lose messages (per-team lock serializes RMW)", async () => {
    const team = await createTeam(teamsRoot, "concurrency-squad", "locks serialize read-modify-write")
    await addMemberSlot(teamsRoot, team, { id: "m01", focus: "writer a", subagent_type: "coding" })
    await addMemberSlot(teamsRoot, team, { id: "m02", focus: "writer b", subagent_type: "reviewer" })

    const N = 20
    const sends = Array.from({ length: N }, (_, i) =>
      appendMessage(teamsRoot, team, i % 2 === 0 ? "m01" : "m02", "lead", `msg-${i}`)
    )
    await Promise.all(sends)

    const status = await getStatus(teamsRoot, team)
    // Without the per-team lock, concurrent read->modify->write would lose updates;
    // every one of the N messages must survive.
    expect(status.state.messages).toHaveLength(N)
    const contents = status.state.messages.map((m) => m.content).sort()
    expect(contents).toEqual(
      Array.from({ length: N }, (_, i) => `msg-${i}`).sort()
    )
  })

  test("mixed concurrent mutations (appendMessage + recordSpawnMetadata) serialize without deadlock or lost updates", async () => {
    const team = await createTeam(teamsRoot, "mixed-concurrency", "")
    await addMemberSlot(teamsRoot, team, { id: "m01", focus: "area a", subagent_type: "coding" })

    const ops: Promise<unknown>[] = []
    for (let i = 0; i < 8; i++) {
      ops.push(appendMessage(teamsRoot, team, "m01", "lead", `m-${i}`))
    }
    for (let i = 0; i < 4; i++) {
      ops.push(recordSpawnMetadata(teamsRoot, team, "m01", { heartbeat: `hb-${i}` }))
    }
    await Promise.all(ops)

    const status = await getStatus(teamsRoot, team)
    expect(status.state.messages).toHaveLength(8)
    // recordSpawnMetadata overlays serialize; recordedAt is always stamped
    expect(status.config.members[0].spawnMetadata?.recordedAt).toBeTruthy()
  })

  test("malformed persisted state fails closed with a labelled error", async () => {
    const team = await createTeam(teamsRoot, "corrupt-state", "")
    await addMemberSlot(teamsRoot, team, { id: "m01", focus: "x" })

    const statePath = join(teamsRoot, team, "state.json")
    await writeFile(statePath, "{ not valid json ", "utf8")

    await expect(getStatus(teamsRoot, team)).rejects.toThrow(/fails closed/i)
    await expect(appendMessage(teamsRoot, team, "lead", "m01", "late")).rejects.toThrow(/fails closed/i)
  })

  test("wrong-shape persisted config fails closed", async () => {
    const team = await createTeam(teamsRoot, "corrupt-config", "")
    const configPath = join(teamsRoot, team, "config.json")
    // valid JSON, but missing the required `members` array -> schema rejects
    await writeFile(configPath, JSON.stringify({ id: team, name: "x" }), "utf8")

    await expect(getStatus(teamsRoot, team)).rejects.toThrow(/fails closed/i)
    await expect(addMemberSlot(teamsRoot, team, { focus: "y" })).rejects.toThrow(/fails closed/i)
  })
})
