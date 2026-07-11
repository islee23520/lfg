import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { runLfg, runLfgText } from "./test/test-process"

describe("lfg codex exec", () => {
  test("returns an explicit no-spawn plan for JSON automation", async () => {
    // Given: a task that a Hephaestus worker could delegate to Codex.
    const task = "Implement one focused change."

    // When: the JSON command is requested.
    const result = await runLfg(["--json", "codex", "exec", task])

    // Then: the command describes Codex exec without starting a subprocess.
    expect(result.exitCode).toBe(0)
    expect(result.json).toMatchObject({
      ok: true,
      status: "planned",
      command: "codex_exec",
      executed: false,
      argv: ["codex", "exec", "--cd", process.cwd(), "--sandbox", "workspace-write", task],
    })
  })

  test("runs the Codex command and returns its execution receipt", async () => {
    // Given: a deterministic Codex command on PATH.
    const bin = await mkdtemp(join(tmpdir(), "lfg-cli-codex-bin-"))
    const receipt = join(bin, "receipt.txt")
    await writeFile(join(bin, "codex"), `#!/bin/sh\nprintf '%s\\n' "$@" > ${shellQuote(receipt)}\n`, { mode: 0o755 })
    await chmod(join(bin, "codex"), 0o755)

    // When: lfg receives a concrete execution task.
    const result = await runLfgText(["codex", "exec", "Verify a focused task."], "", { PATH: bin })

    // Then: the CLI runs the bounded Codex exec route and reports completion.
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('"status": "completed"')
    await expect(readFile(receipt, "utf8")).resolves.toContain("Verify a focused task.\n")
  })

  test("rejects an empty Codex task", async () => {
    // Given: the executor command with no task text.

    // When: JSON automation invokes it.
    const result = await runLfg(["--json", "codex", "exec"])

    // Then: lfg rejects the request before spawning Codex.
    expect(result.exitCode).toBe(1)
    expect(result.json).toMatchObject({ ok: false, status: "invalid_codex_task" })
  })
})

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\\"'\\\"'")}'`
}
