import { describe, expect, test } from "bun:test"
import { createTempLfgState } from "../../../test-utils/temp-state"
import { runLfgTs } from "../../../test-utils/wrapper-runner"
import { teamCommand, TEAM_PROVIDERS } from "./team"
import { ultraworkCommand } from "./ultrawork"
import { slashCommand } from "./slash"
import { goalCommand } from "./goal"
import { WORKFLOW_STUB_COMMANDS, workflowStubCommand } from "./workflow-stubs"

describe("T07 team/ultrawork/workflow TypeScript commands", () => {
  test("team dry-run returns smoke-safe noop JSON without providers", async () => {
    const temp = await createTempLfgState()
    try {
      const providers = await teamCommand(["providers"], { env: temp.env })
      expect(providers.providers).toContain("noop")
      expect(providers.providers).toContain("grok")
      expect(TEAM_PROVIDERS).toContain("noop")

      const result = await teamCommand(["create", "3:executor", "verify release gates", "--providers", "noop", "--dry-run"], { env: temp.env })
      expect(result).toMatchObject({ ok: true, command: "team create", dryRun: true, status: "planned", memberCount: 3, evidence: "team-create-dry-run=ok" })
      expect(JSON.stringify(result)).toContain("noop")
    } finally {
      await temp.cleanup()
    }
  })

  test("team create/status/resume/shutdown persists under mode-aware run state", async () => {
    const temp = await createTempLfgState()
    try {
      const created = await teamCommand(["create", "2:executor", "ship T07", "--providers", "noop", "--name", "t07-team"], { env: temp.env })
      expect(created.statePath).toContain("runs/team-t07-team/teams/t07-team")
      const status = await teamCommand(["status", "t07-team"], { env: temp.env })
      expect(status).toMatchObject({ ok: true, status: "running", memberCount: 2 })
      const resumed = await teamCommand(["resume", "t07-team"], { env: temp.env })
      expect(resumed).toMatchObject({ ok: true, evidence: "team-resume=ok" })
      const shutdown = await teamCommand(["shutdown", "t07-team"], { env: temp.env })
      expect(shutdown).toMatchObject({ ok: true, status: "shutdown", evidence: "team-shutdown=ok" })
    } finally {
      await temp.cleanup()
    }
  })

  test("ultrawork lifecycle uses ulw-kernel dispatch evidence", async () => {
    const temp = await createTempLfgState()
    try {
      const created = await ultraworkCommand(["create", "make runtime durable", "--id", "uw-1"], { env: temp.env })
      expect(created).toMatchObject({ ok: true, id: "uw-1", status: "accepted", evidence: "ultrawork-accepted=ok", dispatched: true })
      expect(created.intents).toEqual(["ultrawork"])
      const status = await ultraworkCommand(["status", "--id", "uw-1"], { env: temp.env })
      expect(status).toMatchObject({ ok: true, status: "accepted" })
      const stopped = await ultraworkCommand(["stop", "--id", "uw-1"], { env: temp.env })
      expect(stopped).toMatchObject({ ok: true, status: "manual_stop", evidence: "ultrawork-manual-stop=ok" })
    } finally {
      await temp.cleanup()
    }
  })

  test("slash routes through runtime", async () => {
    const result = await slashCommand(["/ulw ship tests"], { now: () => "2026-05-21T00:00:00Z" })
    expect(result).toMatchObject({ ok: true, route: "runtime", slashCommand: "ulw", evidence: "slash-runtime-route=ok" })
    const dispatchedPrompts = Array.isArray(result.dispatchedPrompts) ? result.dispatchedPrompts : []
    const firstPrompt = dispatchedPrompts[0]
    const firstPromptRecord = typeof firstPrompt === "object" && firstPrompt !== null && !Array.isArray(firstPrompt) ? firstPrompt : {}
    expect(dispatchedPrompts.length).toBeGreaterThanOrEqual(1)
    expect(String(firstPromptRecord.sessionID ?? "")).toMatch(/^slash-/)
    expect(String(firstPromptRecord.message ?? "")).toContain("ULTRAWORK")
  })

  test("goal create/status/list returns durable JSON", async () => {
    const temp = await createTempLfgState()
    try {
      const created = await goalCommand(["create", "--id", "goal-1", "--objective", "ship commands"], { env: temp.env })
      expect(created).toMatchObject({ ok: true, id: "goal-1", status: "active", evidence: "goal-create=ok" })
      const status = await goalCommand(["status", "--id", "goal-1"], { env: temp.env })
      expect(status).toMatchObject({ ok: true, objective: "ship commands" })
      const list = await goalCommand(["list"], { env: temp.env })
      expect(list).toMatchObject({ ok: true, count: 1, evidence: "goal-list=ok" })
    } finally {
      await temp.cleanup()
    }
  })

  test("workflow compatibility stubs all return valid JSON", () => {
    for (const command of WORKFLOW_STUB_COMMANDS) {
      const result = workflowStubCommand(command, ["status", "--id", "x"], { now: () => "2026-05-21T00:00:00Z" })
      expect(result).toMatchObject({ ok: true, command, status: "accepted", compatibility: true, evidence: `${command}-workflow-stub=ok` })
    }
  })

  test("CLI dispatch exposes T07 surfaces", async () => {
    const temp = await createTempLfgState()
    try {
      const team = await runLfgTs("plugins/lfg/bin/lfg.ts", ["--json", "team", "create", "1:executor", "cli dry run", "--providers", "noop", "--dry-run"], temp.processEnv)
      expect(team.exitCode).toBe(0)
      expect(team.json).toMatchObject({ ok: true, command: "team create", dryRun: true, status: "planned" })
      const stub = await runLfgTs("plugins/lfg/bin/lfg.ts", ["--json", "wiki", "status"], temp.processEnv)
      expect(stub.exitCode).toBe(0)
      expect(stub.json).toMatchObject({ ok: true, command: "wiki", compatibility: true })
    } finally {
      await temp.cleanup()
    }
  })
})
