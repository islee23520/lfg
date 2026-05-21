import { describe, expect, test } from "bun:test"
import { createTempLfgState } from "../../../test-utils/temp-state"
import { status } from "./status"

describe("runtime-ts status command", () => {
  test("reports version, catalog, goals, and pointers", async () => {
    const temp = await createTempLfgState()
    try {
      const result = await status({ env: temp.env, processEnv: temp.processEnv })
      expect(result.ok).toBe(true)
      expect(result.pluginRoot).toBe(temp.root)
      expect(result.pluginData).toBe(temp.data)
      expect(result.goals).toMatchObject({ total: 0, active: 0 })
      expect(result.typescriptRuntime).toMatchObject({ runtime: "typescript" })
    } finally {
      await temp.cleanup()
    }
  })
})
