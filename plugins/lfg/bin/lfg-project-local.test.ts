import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { runLfgFromCwd } from "./test-process"

describe("lfg project-local (#28)", () => {
  test("--json project-local inspects cwd .grok", async () => {
    const root = await mkdtemp(join(tmpdir(), "lfg-proj-cli-"))
    await mkdir(join(root, ".grok"), { recursive: true })
    await writeFile(join(root, ".grok", "config.toml"), "[ui]\n", "utf8")
    const result = await runLfgFromCwd(["--json", "project-local"], root)
    expect(result.exitCode).toBe(0)
    expect(result.json).toMatchObject({
      ok: true,
      command: "project-local",
      status: "present",
      configExists: true,
    })
  })
})