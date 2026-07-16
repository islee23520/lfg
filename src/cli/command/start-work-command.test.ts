import { mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { dispatchStartWorkCommand } from "./start-work-command"

describe("start-work Codex launch planning", () => {
  test("builds a dry-run Codex skill launch from plan start-work", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "lfg-start-work-monitor-"))
    const argv = ["start-work", "--plan", ".omo/plans/release.md", "--focus", "Ship the release", "--cwd", cwd]

    const result = await dispatchStartWorkCommand(argv, { json: true, noProbe: true, env: {} })

    expect(result).toMatchObject({
      ok: true,
      status: "planned",
      command: "plan",
      subcommand: "start-work",
      dryRun: true,
      executed: false,
      skill: "$start-work",
      planPath: ".omo/plans/release.md",
      handoff: {
        role: "coding",
        engine: "gpt",
        resultPath: null,
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
      },
      lfgIsPlugin: false,
    })
    expect((result.orchestrator as { resultPath: string }).resultPath).toMatch(/^codex-app:start-work:/)
    const launch = (result.handoff as { launch: { argv: readonly string[] } }).launch
    expect(launch.argv.slice(0, 2)).toEqual(["codex", "exec"])
    expect(launch.argv.at(-1)).toContain("$start-work")
    expect(launch.argv.at(-1)).toContain(".omo/plans/release.md")
    const inbox = JSON.parse(await readFile(join(cwd, ".omo/orchestrator/inbox.json"), "utf8")) as {
      readonly threads: readonly { readonly role: string; readonly resultPath: string }[]
    }
    expect(inbox.threads[0]?.role).toBe("coding")
    expect(inbox.threads[0]?.resultPath).toMatch(/^codex-app:start-work:/)
  })

  test("rejects missing focus and plan inputs", async () => {
    const result = await dispatchStartWorkCommand(["start-work"], { json: true, noProbe: true, env: {} })
    expect(result).toMatchObject({ ok: false, status: "invalid_start_work_plan", executed: false })
  })
})
