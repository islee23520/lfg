import { mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { dispatchUlwPlanCommand } from "./ulw-plan-command"

describe("Codex ulw-plan launch planning", () => {
  test("builds a read-only GPT plan handoff with structural skill metadata", async () => {
    // Given
    const cwd = await mkdtemp(join(tmpdir(), "lfg-ulw-plan-monitor-"))

    // When
    const result = await dispatchUlwPlanCommand([
      "ulw-plan", "--focus", "Design the release", "--cwd", cwd,
    ], { json: true, noProbe: true, env: {} })

    // Then
    expect(result).toMatchObject({
      ok: true,
      command: "plan",
      subcommand: "ulw-plan",
      dryRun: true,
      executed: false,
      skill: "$ulw-plan",
      skillPath: "skills/ulw-plan/SKILL.md",
      resultPath: ".omo/external-engine/plan-ulw-plan-codex-skill-result.md",
      handoff: {
        role: "plan_assist",
        engine: "gpt",
        safetyMode: "read",
        canWrite: false,
        launch: { binary: "codex", cwd },
      },
      transport: {
        primary: "app-server",
        fallback: "codex-exec",
        fullyTransferable: true,
        grokIsOrchestrator: true,
      },
      orchestrator: {
        registered: true,
        role: "plan_assist",
        status: "planned",
        resultPath: ".omo/external-engine/plan-ulw-plan-codex-skill-result.md",
      },
    })
    const inbox = JSON.parse(await readFile(join(cwd, ".omo/orchestrator/inbox.json"), "utf8")) as {
      readonly threads: readonly { readonly role: string; readonly resultPath: string }[]
    }
    expect(inbox.threads[0]).toMatchObject({
      role: "plan_assist",
      resultPath: ".omo/external-engine/plan-ulw-plan-codex-skill-result.md",
    })
  })

  test("rejects an empty planning objective", async () => {
    // Given / When
    const result = await dispatchUlwPlanCommand(["ulw-plan"], { json: true, noProbe: true, env: {} })

    // Then
    expect(result).toMatchObject({ ok: false, status: "invalid_ulw_plan", executed: false })
  })
})
