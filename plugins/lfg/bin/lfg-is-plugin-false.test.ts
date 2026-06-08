import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { runLfg, runLfgFromCwd } from "./test-process"

describe("lfgIsPlugin ownership (plan DoD)", () => {
  test("doctor and setup plan JSON set lfgIsPlugin false", async () => {
    const plan = await runLfg(["--json", "setup"], {})
    expect(plan.json).toMatchObject({ lfgIsPlugin: false })
    const home = await mkdtemp(join(tmpdir(), "lfg-isplugin-"))
    const doctor = await runLfg(["--json", "doctor"], { HOME: home })
    expect(doctor.json).toMatchObject({ lfgIsPlugin: false })
  })

  test("project-local JSON sets lfgIsPlugin false", async () => {
    const root = await mkdtemp(join(tmpdir(), "lfg-isplugin-proj-"))
    const result = await runLfgFromCwd(["--json", "project-local"], root)
    expect(result.json).toMatchObject({ lfgIsPlugin: false, command: "project-local" })
  })
})