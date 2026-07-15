import { mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { dispatchStartWorkCommand } from "./start-work-command"

describe("start-work external Codex launch planning", () => {
  test("builds a dry-run Codex skill launch from plan start-work", async () => {
    // Given
    const cwd = await mkdtemp(join(tmpdir(), "lfg-start-work-monitor-"))
    const argv = ["start-work", "--plan", ".omo/plans/release.md", "--focus", "Ship the release", "--cwd", cwd]

    // When
    const result = await dispatchStartWorkCommand(argv, { json: true, noProbe: true, env: {} })

    // Then
    expect(result).toMatchObject({
      ok: true,
      status: "planned",
      command: "plan",
      subcommand: "start-work",
      dryRun: true,
      executed: false,
      skill: "$start-work",
      planPath: ".omo/plans/release.md",
      resultPath: ".omo/external-engine/start-work-codex-skill-result.md",
      handoff: {
        role: "coding",
        engine: "gpt",
        resultPath: ".omo/external-engine/start-work-codex-skill-result.md",
        launch: { binary: "codex" },
      },
      readiness: { checked: false, ok: true, status: "skipped" },
      transport: {
        primary: "app-server",
        fallback: "codex-exec",
        fullyTransferable: true,
        grokIsOrchestrator: true,
      },
      orchestrator: {
        registered: true,
        role: "coding",
        status: "planned",
        resultPath: ".omo/external-engine/start-work-codex-skill-result.md",
      },
      lfgIsPlugin: false,
    })
    const launch = (result.handoff as { launch: { argv: readonly string[] } }).launch
    expect(launch.argv.slice(0, 2)).toEqual(["codex", "exec"])
    expect(launch.argv.at(-1)).toContain("$start-work")
    expect(launch.argv.at(-1)).toContain(".omo/plans/release.md")
    const inbox = JSON.parse(await readFile(join(cwd, ".omo/orchestrator/inbox.json"), "utf8")) as {
      readonly threads: readonly { readonly role: string; readonly resultPath: string }[]
    }
    expect(inbox.threads[0]).toMatchObject({
      role: "coding",
      resultPath: ".omo/external-engine/start-work-codex-skill-result.md",
    })
  })

  test("rejects missing focus and plan inputs", async () => {
    // Given / When
    const result = await dispatchStartWorkCommand(["start-work"], { json: true, noProbe: true, env: {} })

    // Then
    expect(result).toMatchObject({ ok: false, status: "invalid_start_work_plan", executed: false })
  })
})
