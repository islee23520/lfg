import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { runLfgFromCwd } from "./test/test-process"

describe("lfg project-local (#28)", () => {
  test("--json project-local is not a public command", async () => {
    const root = await mkdtemp(join(tmpdir(), "lfg-proj-cli-"))
    await mkdir(join(root, ".grok"), { recursive: true })
    await writeFile(join(root, ".grok", "config.toml"), "[ui]\n", "utf8")
    const result = await runLfgFromCwd(["--json", "project-local"], root)
    expect(result.exitCode).toBe(1)
    expect(result.json).toMatchObject({
      ok: false,
      status: "error",
      code: "unsupported_command",
      command: "project-local",
      supportedCommands: ["setup", "uninstall", "doctor", "accounts", "set-tier", "xai", "mcp", "claude", "handoff", "plan", "start-work", "orchestrator", "ulw", "ulw-loop"],
    })
  })
})
