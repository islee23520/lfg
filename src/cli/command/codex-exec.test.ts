import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { codexExecPlan, runCodexExec } from "./codex-exec"

describe("Codex executor", () => {
  test("plans a workspace-write Codex exec invocation without executing it", () => {
    // Given: a concrete autonomous implementation task.
    const task = "Implement the requested change and run focused tests."

    // When: lfg builds the Codex execution plan.
    const result = codexExecPlan(task, "/tmp/lfg-workspace")

    // Then: the plan is explicit and bounded to the selected workspace sandbox.
    expect(result).toMatchObject({
      ok: true,
      status: "planned",
      command: "codex_exec",
      executed: false,
      argv: ["codex", "exec", "--cd", "/tmp/lfg-workspace", "--sandbox", "workspace-write", task],
    })
  })

  test("executes Codex with the explicit task and current workspace", async () => {
    // Given: an executable Codex stand-in on PATH and a target workspace.
    const bin = await mkdtemp(join(tmpdir(), "lfg-codex-exec-bin-"))
    const workspace = await mkdtemp(join(tmpdir(), "lfg-codex-exec-workspace-"))
    const receipt = join(bin, "codex-receipt.txt")
    const command = join(bin, "codex")
    await writeFile(command, `#!/bin/sh\nprintf '%s\\n' "$@" > ${shellQuote(receipt)}\n`, "utf8")
    await chmod(command, 0o755)

    // When: lfg executes the task through the Codex command contract.
    const result = await runCodexExec("Write a receipt only.", workspace, { ...process.env, PATH: bin })

    // Then: Codex receives the fixed exec, workspace, and sandbox arguments.
    expect(result).toMatchObject({ ok: true, status: "completed", command: "codex_exec", exitCode: 0 })
    await expect(readFile(receipt, "utf8")).resolves.toBe([
      "exec",
      "--cd",
      workspace,
      "--sandbox",
      "workspace-write",
      "Write a receipt only.",
      "",
    ].join("\n"))
  })

  test("fails closed when Codex is unavailable", async () => {
    // Given: a PATH without the Codex executable.
    const workspace = await mkdtemp(join(tmpdir(), "lfg-codex-exec-missing-"))

    // When: lfg attempts the explicit task.
    const result = await runCodexExec("Do not execute.", workspace, { PATH: "" })

    // Then: the error identifies the missing command rather than falling back to another agent.
    expect(result).toMatchObject({
      ok: false,
      status: "command_unavailable",
      command: "codex_exec",
      exitCode: 127,
    })
  })
})

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\\"'\\\"'")}'`
}
