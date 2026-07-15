import { mkdtemp, mkdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import {
  emptyInbox,
  loadOrchestratorInbox,
  markAskAnswered,
  pollThreadResults,
  recordUserAsk,
  registerCodexThread,
  saveOrchestratorInbox,
  summarizeInbox,
} from "./inbox"

describe("orchestrator inbox", () => {
  test("records asks, threads, polls RESULT, marks answered", async () => {
    const root = await mkdtemp(join(tmpdir(), "lfg-orch-inbox-"))
    let inbox = emptyInbox()
    const recorded = recordUserAsk(inbox, "please fix the handoff route")
    inbox = recorded.inbox
    expect(inbox.asks).toHaveLength(1)
    expect(inbox.asks[0]?.status).toBe("open")

    const reg = registerCodexThread(inbox, {
      engine: "gpt",
      binary: "codex",
      role: "coding",
      focus: "fix handoff",
      resultPath: ".omo/external-engine/fix-result.md",
      askId: recorded.ask.id,
      status: "running",
    })
    inbox = reg.inbox
    expect(inbox.threads).toHaveLength(1)
    expect(inbox.asks[0]?.status).toBe("in_progress")
    expect(inbox.asks[0]?.threadIds).toContain(reg.thread.id)

    await mkdir(join(root, ".omo", "external-engine"), { recursive: true })
    await writeFile(join(root, ".omo", "external-engine", "fix-result.md"), "STATUS: pass\nSUMMARY: fixed\n", "utf8")
    inbox = await pollThreadResults(root, inbox)
    expect(inbox.threads[0]?.status).toBe("result_ready")
    expect(inbox.threads[0]?.resultStatus).toMatch(/pass/i)

    const path = await saveOrchestratorInbox(root, inbox)
    expect(path).toContain(".omo/orchestrator/inbox.json")
    const loaded = await loadOrchestratorInbox(root)
    expect(loaded.threads[0]?.status).toBe("result_ready")

    const answered = markAskAnswered(loaded, recorded.ask.id, "Told user handoff is fixed.")
    expect(answered.asks[0]?.status).toBe("answered")
    expect(answered.asks[0]?.answerSummary).toContain("handoff")

    const summary = summarizeInbox(root, answered)
    expect(summary.unansweredAsks).toBe(0)
    expect(summary.lines.join("\n")).toContain("lfg-orchestrator-inbox")
  })

  test("multiple threads aggregate on one ask", async () => {
    let inbox = emptyInbox()
    const ask = recordUserAsk(inbox, "do A and B")
    inbox = ask.inbox
    inbox = registerCodexThread(inbox, {
      engine: "gpt",
      binary: "codex",
      role: "coding",
      focus: "A",
      resultPath: ".omo/external-engine/a.md",
      askId: ask.ask.id,
    }).inbox
    inbox = registerCodexThread(inbox, {
      engine: "gpt",
      binary: "codex",
      role: "coding",
      focus: "B",
      resultPath: ".omo/external-engine/b.md",
      askId: ask.ask.id,
    }).inbox
    expect(inbox.threads).toHaveLength(2)
    expect(inbox.asks[0]?.threadIds).toHaveLength(2)
    const summary = summarizeInbox("/tmp", inbox)
    expect(summary.runningThreads).toBe(2)
    expect(summary.needsUserReply).toBe(true)
  })
})
