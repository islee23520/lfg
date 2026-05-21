import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { describe, expect, test } from "bun:test"
import { createTempLfgState } from "../../../test-utils/temp-state"
import { setup, setupCheck, setupInstallPlan } from "./setup"

describe("runtime-ts setup command", () => {
  test("records setup state and install plan", async () => {
    const temp = await createTempLfgState()
    const dest = await mkdtemp(join(tmpdir(), "lfg-install-"))
    try {
      const result = await setup({ pluginDir: dest, dryRun: true }, { env: temp.env })
      expect(result).toMatchObject({ ok: true, dryRun: true, installed: false })
      const check = await setupCheck({ env: temp.env })
      expect(check.status).toBe("ok")
      const plan = await setupInstallPlan({ marketplace: "islee23520/lfg" }, { env: temp.env })
      expect(plan).toMatchObject({ status: "planned", marketplace: "islee23520/lfg" })
    } finally {
      await rm(dest, { recursive: true, force: true })
      await temp.cleanup()
    }
  })
})
