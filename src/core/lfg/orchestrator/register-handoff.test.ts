import { mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { recordUserAsk, emptyInbox, saveOrchestratorInbox } from "./inbox"
import { registerHandoffInOrchestrator } from "./register-handoff"

describe("registerHandoffInOrchestrator", () => {
  test("registers the handoff and links its ask in the durable inbox", async () => {
    // Given
    const projectRoot = await mkdtemp(join(tmpdir(), "lfg-register-handoff-"))
    const recorded = recordUserAsk(emptyInbox(), "Implement durable monitoring")
    await saveOrchestratorInbox(projectRoot, recorded.inbox)

    // When
    const result = await registerHandoffInOrchestrator(projectRoot, {
      engine: "gpt",
      binary: "codex",
      role: "coding",
      focus: "Implement durable monitoring",
      resultPath: ".omo/orchestrator/monitor-result.md",
      status: "planned",
      askId: recorded.ask.id,
    })

    // Then
    expect(result.thread).toMatchObject({
      role: "coding",
      resultPath: ".omo/orchestrator/monitor-result.md",
      askIds: [recorded.ask.id],
    })
    expect(result.inbox.asks[0]).toMatchObject({
      id: recorded.ask.id,
      status: "in_progress",
      threadIds: [result.thread.id],
    })
    const persisted = JSON.parse(await readFile(result.path, "utf8")) as {
      readonly threads: readonly { readonly resultPath: string }[]
    }
    expect(persisted.threads[0]?.resultPath).toBe(".omo/orchestrator/monitor-result.md")
  })
})
