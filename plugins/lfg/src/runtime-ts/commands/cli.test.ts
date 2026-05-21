import { describe, expect, test } from "bun:test"
import { createTempLfgState } from "../../../test-utils/temp-state"
import { runLfgTs } from "../../../test-utils/wrapper-runner"

describe("runtime-ts lfg.ts CLI", () => {
  test("runs requested JSON commands", async () => {
    const temp = await createTempLfgState()
    try {
      const agents = await runLfgTs("plugins/lfg/bin/lfg.ts", ["--json", "agents", "list"], temp.processEnv)
      expect(agents.exitCode).toBe(0)
      expect(agents.json).toMatchObject({ ok: true, count: 12 })
      const doctor = await runLfgTs("plugins/lfg/bin/lfg.ts", ["--json", "doctor", "state", "schema", "check"], temp.processEnv)
      expect(doctor.exitCode).toBe(0)
      expect(doctor.json).toMatchObject({ ok: true, operation: "doctor_state_schema_check" })
    } finally {
      await temp.cleanup()
    }
  })
})
