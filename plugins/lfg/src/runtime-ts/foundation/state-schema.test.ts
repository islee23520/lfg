import { describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { createTempLfgState } from "../../../test-utils/temp-state"
import { bootstrapState, doctorStateSchema, STATE_BOOTSTRAP_DIRS, STATE_SCHEMA_ROOTS, STATE_SCHEMA_VERSION } from "./state-schema"

describe("runtime-ts state schema", () => {
  test("bootstraps Python-compatible .lfg structure", async () => {
    const state = await createTempLfgState()
    try {
      const schema = await bootstrapState(state.env, () => "2026-05-21T00:00:00Z")
      expect(schema.version).toBe(STATE_SCHEMA_VERSION)
      expect(schema.roots).toEqual([...STATE_SCHEMA_ROOTS])
      for (const dir of STATE_BOOTSTRAP_DIRS) expect(existsSync(join(state.data, dir))).toBe(true)
      expect(await doctorStateSchema(state.env)).toMatchObject({ ok: true, missingDirectories: [], missingRoots: [] })
    } finally { await state.cleanup() }
  })
})
