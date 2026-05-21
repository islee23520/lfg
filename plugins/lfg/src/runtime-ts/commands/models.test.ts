import { describe, expect, test } from "bun:test"
import { createTempLfgState } from "../../../test-utils/temp-state"
import { providerAdd } from "./provider"
import { modelsShow } from "./models"

describe("runtime-ts models command", () => {
  test("shows Grok Oracle and configured provider metadata", async () => {
    const temp = await createTempLfgState()
    try {
      await providerAdd({ id: "zai-main", kind: "zai", env: "ZAI_API_KEY" }, { env: temp.env })
      const result = await modelsShow({}, { env: temp.env })
      expect(result).toMatchObject({ ok: true, status: "ok", grokOracle: { provider: "xai", model: "xai/grok-4.3" }, secretStorage: "env-name-only" })
      expect(JSON.stringify(result)).toContain("zai-main")
    } finally {
      await temp.cleanup()
    }
  })
})
