import { mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { dispatchOrchestratorCommand } from "./orchestrator-command"
import type { AppServerClient } from "../../core/lfg/orchestrator/app-server"

describe("orchestrator app-server commands", () => {
  test("watch syncs mocked live threads into the durable inbox", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "lfg-orchestrator-watch-"))
    await dispatchOrchestratorCommand([
      "thread", "register", "--cwd", cwd, "--result-path", ".omo/result.md", "--focus", "watch work", "--session-hint", "session-1",
    ], { json: true, env: {} })
    const client: AppServerClient = { handoff: async () => ({ transport: "codex-exec-fallback", attached: false, thread: null, turnId: null, error: "unused" }), snapshot: async () => ({
      availability: "available", daemonStarted: true, error: null, recipes: [],
      threads: [{ id: "thread-1", sessionId: "session-1", cwd, name: "watch work", preview: null, status: "active", updatedAt: 1 }],
    }) }
    const result = await dispatchOrchestratorCommand(["watch", "--cwd", cwd], { json: true, env: {}, appServerClient: client })
    expect(result).toMatchObject({ ok: true, status: "orchestrator_app_server_synced", sync: { matched: 1, running: 1 } })
    const inbox = JSON.parse(await readFile(join(cwd, ".omo/orchestrator/inbox.json"), "utf8"))
    expect(inbox.threads[0]).toMatchObject({ appServerThreadId: "thread-1", status: "running" })
  })

  test("watch reports recipes and preserves RESULT polling fallback when missing", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "lfg-orchestrator-missing-"))
    const client: AppServerClient = { handoff: async () => ({ transport: "codex-exec-fallback", attached: false, thread: null, turnId: null, error: "unused" }), snapshot: async () => ({
      availability: "missing", daemonStarted: false, error: "codex missing", recipes: ["install", "poll"], threads: [],
    }) }
    const result = await dispatchOrchestratorCommand(["sync-app-server", "--cwd", cwd], { json: true, env: {}, appServerClient: client })
    expect(result).toMatchObject({ ok: false, status: "orchestrator_app_server_missing", fallback: expect.stringContaining("RESULT") })
  })
})
