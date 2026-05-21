import { describe, expect, test } from "bun:test"
import { createTempLfgState } from "../../../test-utils/temp-state"
import { createTeamRun, TeamMailbox, TeamStateStore, TeamTasklist } from "./team-store"

describe("runtime-ts team store", () => {
  test("stores mode-separated runs, mailbox, and tasklist", async () => {
    const state = await createTempLfgState()
    try {
      const store = new TeamStateStore({ env: state.env, mode: "hyperplan", modeId: "hp-1" })
      const run = await createTeamRun(store, "team-one", "verify contracts")
      expect((await store.listRuns())).toEqual([run.id])
      const task = await new TeamTasklist(store, run.id).createTask("implement", "ship TS")
      expect(task.id).toBe("task-1")
      const message = await new TeamMailbox(store, run.id).send("leader", "worker", "message", { body: "go" })
      expect((await new TeamMailbox(store, run.id).poll("worker"))[0]?.id).toBe(message.id)
    } finally { await state.cleanup() }
  })
})
