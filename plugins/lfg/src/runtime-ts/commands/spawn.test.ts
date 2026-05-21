import { describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { createTempLfgState } from "../../../test-utils/temp-state"
import { validateFallbackSpawnEnvelope } from "../services/spawn-adapter"
import { spawnCommand } from "./spawn"

describe("runtime-ts spawn command", () => {
  test("returns and persists canonical fallback envelope", async () => {
    const state = await createTempLfgState()
    try {
      const envelope = await spawnCommand({ agentId: "sisyphus-junior", category: "quick", task: "fixture", provider: "codex", runId: "run-commandspawn" }, state.env)
      expect(envelope).toMatchObject({ ok: true, schemaVersion: 1, operation: "spawn", mode: "fallback", status: "completed", agentId: "sisyphus-junior", evidenceClass: "dependency-free-smoke" })
      expect(envelope.recordPath).toContain("/runs/spawns/run-commandspawn.json")
      expect(envelope.recordPath && existsSync(envelope.recordPath)).toBe(true)
      expect(validateFallbackSpawnEnvelope(envelope)).toEqual([])
    } finally { await state.cleanup() }
  })
})
