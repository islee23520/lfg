import { describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { createTempLfgState } from "../../../test-utils/temp-state"
import { hyperplanCommand } from "./hyperplan"

describe("runtime-ts hyperplan command", () => {
  test("creates durable hyperplan artifact", async () => {
    const state = await createTempLfgState()
    try {
      const artifact = await hyperplanCommand({ objective: "design spawn adapter", runId: "hp-test" }, state.env, () => "2026-05-21T00:00:00Z")
      expect(artifact).toMatchObject({ ok: true, schemaVersion: 1, operation: "hyperplan", runId: "hp-test", status: "completed", boundedRoster: true })
      expect(typeof artifact.artifactPath === "string" && existsSync(artifact.artifactPath)).toBe(true)
    } finally { await state.cleanup() }
  })
})
