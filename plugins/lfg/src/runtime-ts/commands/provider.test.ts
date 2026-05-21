import { describe, expect, test } from "bun:test"
import { createTempLfgState } from "../../../test-utils/temp-state"
import { authLogin } from "./auth"
import { providerList, providerShow } from "./provider"

describe("runtime-ts provider/auth commands", () => {
  test("records provider login metadata without secrets", async () => {
    const temp = await createTempLfgState()
    try {
      const login = await authLogin({ provider: "openai", id: "openai-main", env: "OPENAI_API_KEY" }, { env: temp.env })
      expect(login).toMatchObject({ ok: true, auth: { secretStored: false } })
      const list = await providerList({ env: temp.env })
      expect(list.count).toBe(1)
      const show = await providerShow({ id: "openai-main" }, { env: temp.env })
      expect(show).toMatchObject({ ok: true, provider: { id: "openai-main", env: "OPENAI_API_KEY", secretStored: false } })
    } finally {
      await temp.cleanup()
    }
  })
})
