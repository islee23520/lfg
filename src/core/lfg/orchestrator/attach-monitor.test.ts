import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, test } from "vitest"
import { attachMonitorAfterHandoff } from "./attach-monitor"
import { registerHandoffInOrchestrator } from "./register-handoff"
import type { AppServerClient } from "./app-server"

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((r) => rm(r, { recursive: true, force: true })))
})

describe("attachMonitorAfterHandoff", () => {
  test("writes monitor-board and marks attached after handoff registration", async () => {
    const root = await mkdtemp(join(tmpdir(), "lfg-attach-monitor-"))
    roots.push(root)
    await registerHandoffInOrchestrator(root, {
      engine: "gpt",
      binary: "codex",
      role: "coding",
      focus: "implement board",
      resultPath: "codex-app:thread-1",
      status: "running",
      appServerThreadId: "thread-1",
      appServerSessionId: "session-1",
    })
    const client: AppServerClient = {
      snapshot: async () => ({
        availability: "available",
        daemonStarted: true,
        threads: [
          {
            id: "thread-1",
            sessionId: "session-1",
            cwd: root,
            name: "lfg/handoff: implement board",
            preview: null,
            status: "active",
            updatedAt: Date.now(),
          },
        ],
        error: null,
        recipes: [],
      }),
      handoff: async () => ({
        transport: "app-server",
        attached: true,
        thread: {
          id: "thread-1",
          sessionId: "session-1",
          cwd: root,
          name: null,
          preview: null,
          status: "active",
          updatedAt: 1,
        },
        turnId: "turn-1",
        goalSynced: true,
        error: null,
      }),
    }

    const result = await attachMonitorAfterHandoff(root, {
      appServerClient: client,
      follow: false,
    })

    expect(result.board.attached).toBe(true)
    expect(result.board.appServer.availability).toBe("available")
    expect(result.board.appServer.activeThreadIds).toContain("thread-1")
    expect(result.follow.spawned).toBe(false)
    const raw = await readFile(result.boardPath, "utf8")
    const board = JSON.parse(raw) as { attached: boolean; threads: { status: string }[] }
    expect(board.attached).toBe(true)
    expect(board.threads.some((t) => t.status === "running")).toBe(true)
  })

  test("launches the follow watcher through a PATH-resolved lfg binary", async () => {
    const root = await mkdtemp(join(tmpdir(), "lfg-attach-monitor-path-"))
    roots.push(root)
    const binDir = join(root, "bin")
    const argvPath = join(root, "watch-argv.txt")
    await mkdir(binDir, { recursive: true })
    await writeFile(join(binDir, "lfg"), `#!/bin/sh\nprintf '%s\\n' "$@" > "${argvPath}"\n`, "utf8")
    await chmod(join(binDir, "lfg"), 0o755)
    const client: AppServerClient = {
      snapshot: async () => ({ availability: "available", daemonStarted: true, threads: [], error: null, recipes: [] }),
      handoff: async () => ({ transport: "codex-exec-fallback", attached: false, thread: null, turnId: null, goalSynced: false, error: "not used" }),
    }

    const result = await attachMonitorAfterHandoff(root, {
      appServerClient: client,
      env: { PATH: binDir },
    })

    expect(result.follow.spawned).toBe(true)
    const argv = await readEventually(argvPath)
    expect(argv).toContain("orchestrator\nwatch\n--follow\n--cwd")
  })
})

async function readEventually(path: string): Promise<string> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      return await readFile(path, "utf8")
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
  }
  return readFile(path, "utf8")
}
