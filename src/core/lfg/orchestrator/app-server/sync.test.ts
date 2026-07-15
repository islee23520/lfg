import { describe, expect, test } from "vitest"
import { emptyInbox, registerCodexThread } from "../inbox"
import { syncAppServerSnapshot } from "./sync"

describe("syncAppServerSnapshot", () => {
  test("matches a planned ledger thread by session hint and records live status", () => {
    const registered = registerCodexThread(emptyInbox("2026-01-01T00:00:00.000Z"), {
      engine: "gpt",
      binary: "codex",
      role: "coding",
      focus: "implement app-server watch",
      resultPath: ".omo/result.md",
      sessionHint: "session-1",
    })
    const synced = syncAppServerSnapshot("/workspace/project", registered.inbox, {
      availability: "available",
      daemonStarted: true,
      error: null,
      recipes: [],
      threads: [{ id: "thread-1", sessionId: "session-1", cwd: "/workspace/project", name: null, preview: null, status: "active", updatedAt: 1 }],
    }, "2026-01-01T00:01:00.000Z")

    expect(synced.summary).toMatchObject({ matched: 1, running: 1, liveThreads: 1 })
    expect(synced.inbox.threads[0]).toMatchObject({
      status: "running",
      appServerThreadId: "thread-1",
      appServerSessionId: "session-1",
      appServerStatus: "active",
    })
  })

  test("fails closed without changing ledger status when app-server is absent", () => {
    const registered = registerCodexThread(emptyInbox(), {
      engine: "gpt", binary: "codex", role: "coding", focus: "x", resultPath: ".omo/result.md",
    })
    const synced = syncAppServerSnapshot("/workspace/project", registered.inbox, {
      availability: "missing", daemonStarted: false, error: "missing", recipes: ["poll"], threads: [],
    })
    expect(synced.inbox.threads[0]?.status).toBe("planned")
    expect(synced.summary.matched).toBe(0)
  })
})
