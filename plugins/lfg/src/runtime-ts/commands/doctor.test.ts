import { describe, expect, test } from "bun:test"
import { createTempLfgState } from "../../../test-utils/temp-state"
import { doctor, doctorStateSchemaCheck } from "./doctor"

describe("runtime-ts doctor command", () => {
  test("emits evidence-style doctor and focused state schema output", async () => {
    const temp = await createTempLfgState()
    try {
      const focused = await doctorStateSchemaCheck({ env: temp.env })
      expect(focused).toMatchObject({ ok: true, status: "pass", operation: "doctor_state_schema_check" })
      expect(focused.evidence).toContain("state-schema-doctor=ok")
      const result = await doctor({ env: temp.env })
      expect(result.checks).toBeArray()
      expect(JSON.stringify(result.checks)).toContain("state_schema")
    } finally {
      await temp.cleanup()
    }
  })
})
