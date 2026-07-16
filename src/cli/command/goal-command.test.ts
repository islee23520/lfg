import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, test, vi } from "vitest"
import { dispatchGoalCommand } from "./goal-command"

const roots = new Set<string>()

afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  await Promise.all([...roots].map((root) => rm(root, { recursive: true, force: true })))
  roots.clear()
})

describe("plan goal command", () => {
  test("syncs the goal to Codex App and registers its app-server thread", async () => {
    const root = await mkdtemp(join(tmpdir(), "lfg-plan-goal-"))
    roots.add(root)
    const inboxDir = join(root, ".omo", "orchestrator")
    await mkdir(inboxDir, { recursive: true })
    await writeFile(join(inboxDir, "inbox.json"), `${JSON.stringify({
      version: 1,
      updatedAt: "2026-07-16T00:00:00.000Z",
      asks: [{ id: "ask-1", userText: "Ship goal sync", createdAt: "2026-07-16T00:00:00.000Z", updatedAt: "2026-07-16T00:00:00.000Z", status: "open", userAnsweredAt: null, answerSummary: null, threadIds: [] }],
      threads: [],
    })}\n`, "utf8")

    const result = await dispatchGoalCommand(["goal", "--focus", "Ship goal sync", "--cwd", root, "--ask-id", "ask-1"], {
      json: true,
      appServerClient: {
        snapshot: vi.fn(),
        handoff: vi.fn().mockResolvedValue({
          transport: "app-server",
          attached: false,
          thread: { id: "app-thread-1", sessionId: "session-1", cwd: root, name: null, preview: null, status: "active", updatedAt: 1 },
          turnId: "turn-1",
          goalSynced: true,
          error: null,
        }),
      },
    })

    expect(result).toMatchObject({
      ok: true,
      subcommand: "goal",
      transport: "app-server",
      threadId: "app-thread-1",
      goalSynced: true,
      orchestrator: { registered: true, appServerThreadId: "app-thread-1" },
    })
    const inbox = JSON.parse(await readFile(join(root, ".omo", "orchestrator", "inbox.json"), "utf8"))
    expect(inbox.threads[0].appServerThreadId).toBe("app-thread-1")
    expect(inbox.asks[0]).toMatchObject({ id: "ask-1", status: "in_progress", threadIds: [inbox.threads[0].id] })
  })

  test("projects the ulw-loop plan and Codex App thread into a passive board", async () => {
    vi.stubEnv("LFG_ULW_LOOP_SESSION_ID", "")
    vi.stubEnv("CODEX_THREAD_ID", "")
    const root = await mkdtemp(join(tmpdir(), "lfg-goal-board-"))
    roots.add(root)
    await writePlan(root)

    const result = await dispatchGoalCommand(["board", "--cwd", root], {
      json: true,
      appServerClient: appServerClient(root),
    })

    expect(result).toMatchObject({
      ok: true,
      status: "goal_board",
      subcommand: "board",
      board: {
        currentGoal: { id: "G001", status: "in_progress" },
        nextGoal: { id: "G002", status: "pending" },
        appServer: { availability: "available", activeThreadId: "app-thread-1" },
      },
    })
  })

  test("drives the next ulw-loop goal through Codex App with the skill route embedded", async () => {
    vi.stubEnv("LFG_ULW_LOOP_SESSION_ID", "")
    vi.stubEnv("CODEX_THREAD_ID", "")
    const root = await mkdtemp(join(tmpdir(), "lfg-goal-drive-"))
    roots.add(root)
    await writePlan(root, "pending")
    const handoff = vi.fn().mockResolvedValue({
      transport: "app-server",
      attached: false,
      thread: { id: "app-thread-1", sessionId: "session-1", cwd: root, name: null, preview: null, status: "active", updatedAt: 1 },
      turnId: "turn-1",
      goalSynced: true,
      error: null,
    })

    const result = await dispatchGoalCommand(["drive", "--cwd", root, "--skill", "ulw-loop"], {
      json: true,
      appServerClient: { snapshot: vi.fn(), handoff },
    })

    expect(result).toMatchObject({
      ok: true,
      status: "goal_driven",
      subcommand: "drive",
      goal: { id: "G001", status: "in_progress" },
      skillRoute: { requested: ["ulw-loop"], embedded: true },
      transport: "app-server",
    })
    expect(handoff).toHaveBeenCalledWith(expect.objectContaining({
      prompt: expect.stringMatching(/SKILL ROUTE[\s\S]*ulw-loop[\s\S]*normal Codex session/),
    }))
  })

  test("returns a successful explicit fallback plan when the Codex App daemon is unavailable", async () => {
    vi.stubEnv("LFG_ULW_LOOP_SESSION_ID", "")
    vi.stubEnv("CODEX_THREAD_ID", "")
    const root = await mkdtemp(join(tmpdir(), "lfg-goal-fallback-"))
    roots.add(root)
    await writePlan(root, "pending")

    const result = await dispatchGoalCommand(["drive", "--cwd", root], {
      json: true,
      appServerClient: {
        snapshot: vi.fn(),
        handoff: vi.fn().mockResolvedValue({
          transport: "codex-exec-fallback",
          attached: false,
          thread: null,
          turnId: null,
          goalSynced: false,
          error: "daemon unavailable",
        }),
      },
    })

    expect(result).toMatchObject({
      ok: true,
      status: "goal_fallback_planned",
      executed: false,
      transport: "codex-exec-fallback",
      fallbackReason: "daemon unavailable",
    })
  })

  test("polls RESULT files without sending another Codex turn", async () => {
    const root = await mkdtemp(join(tmpdir(), "lfg-goal-poll-"))
    roots.add(root)
    await writePlan(root)
    const resultPath = ".omo/orchestrator/coding-gpt-result.md"
    await mkdir(join(root, ".omo", "orchestrator"), { recursive: true })
    await writeFile(join(root, resultPath), "STATUS: pass\nSUMMARY: shipped\nEVIDENCE: focused tests\n", "utf8")
    const handoff = vi.fn()

    const result = await dispatchGoalCommand(["poll", "--cwd", root, "--result-path", resultPath], {
      json: true,
      appServerClient: { snapshot: vi.fn(), handoff },
    })

    expect(result).toMatchObject({
      ok: true,
      status: "goal_result_ready",
      subcommand: "poll",
      passive: true,
      result: { path: resultPath, status: "pass" },
    })
    expect(handoff).not.toHaveBeenCalled()
  })
})

function appServerClient(root: string) {
  return {
    handoff: vi.fn(),
    snapshot: vi.fn().mockResolvedValue({
      availability: "available",
      daemonStarted: true,
      error: null,
      recipes: [],
      threads: [{ id: "app-thread-1", sessionId: "session-1", cwd: root, name: "goal", preview: null, status: "active", updatedAt: 1 }],
    }),
  }
}

async function writePlan(root: string, firstStatus: "pending" | "in_progress" = "in_progress"): Promise<void> {
  const dir = join(root, ".omo", "ulw-loop")
  await mkdir(dir, { recursive: true })
  const criterion = { id: "C001", scenario: "run CLI", userModel: "happy", expectedEvidence: "CLI JSON", essential: true, capturedEvidence: null, status: "pending" }
  const goal = (id: string, title: string, status: "pending" | "in_progress") => ({
    id, title, objective: `${title} with TypeScript TDD and ulw-loop`, status, successCriteria: [criterion], attempt: 0,
    createdAt: "2026-07-16T00:00:00.000Z", updatedAt: "2026-07-16T00:00:00.000Z",
  })
  await writeFile(join(dir, "brief.md"), "Ship the goal board.\n", "utf8")
  await writeFile(join(dir, "ledger.jsonl"), "", "utf8")
  await writeFile(join(dir, "goals.json"), `${JSON.stringify({
    version: 1,
    createdAt: "2026-07-16T00:00:00.000Z",
    updatedAt: "2026-07-16T00:00:00.000Z",
    briefPath: ".omo/ulw-loop/brief.md",
    goalsPath: ".omo/ulw-loop/goals.json",
    ledgerPath: ".omo/ulw-loop/ledger.jsonl",
    codexGoalMode: "aggregate",
    goals: [goal("G001", "Build board", firstStatus), goal("G002", "Poll result", "pending")],
    codexObjective: "Complete the durable ulw-loop plan.",
  }, null, 2)}\n`, "utf8")
}
