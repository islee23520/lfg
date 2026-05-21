import { describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { createTempLfgState } from "../../../test-utils/temp-state"
import { spawnFallbackAgent, validateFallbackSpawnEnvelope } from "./spawn-adapter"

describe("runtime-ts spawn adapter", () => {
  test("builds and persists Python-compatible fallback envelopes", async () => {
    const state = await createTempLfgState()
    try {
      const envelope = await spawnFallbackAgent("sisyphus-junior", { category: "quick", task: "fixture", provider: "codex", runId: "run-testspawn" }, state.env)
      expect(envelope).toMatchObject({ ok: true, schemaVersion: 1, operation: "spawn", mode: "fallback", status: "completed", agentId: "sisyphus-junior", agent_id: "sisyphus-junior", evidenceClass: "dependency-free-smoke" })
      expect(envelope.broker.api).toBe("internal-non-agent")
      expect(envelope.oracleReview.gate).toBe("xai/grok")
      expect(validateFallbackSpawnEnvelope(envelope)).toEqual([])
      expect(envelope.recordPath && existsSync(envelope.recordPath)).toBe(true)
    } finally { await state.cleanup() }
  })
})
