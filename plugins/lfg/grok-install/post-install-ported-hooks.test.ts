import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { runInternalGrokInstall } from "./run-internal"
import { verifyGrokInstallSurface } from "./post-install-verify"

describe("post-install ported hooks (#26 extension)", () => {
  test("internal install registers both lfg hook names", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-post-hooks-"))
    await runInternalGrokInstall({ HOME: home })
    const json = await verifyGrokInstallSurface({ home })
    expect(json.hookNames).toEqual(expect.arrayContaining(["lfg-visual-guidance", "lfg-agent-reminder"]))
    expect(json.hooksRegistered).toBe(true)
  })
})