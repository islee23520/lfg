import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { describe, expect, test } from "vitest"
import { inspectProjectOmoLedger } from "./project-omo-ledger"
import type { ProjectOmoLedgerOptions, ProjectOmoLedgerSummary } from "./project-omo-ledger"

const sessionId = "019eb59e-f9b0-7f52-adbb"

describe("project .omo ledger", () => {
  test("reports absent when project has no .omo directory", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "lfg-omo-absent-"))

    const summary = await inspectProjectOmoLedger({ projectRoot, sessionId })

    expect(summary).toMatchObject({
      status: "absent",
      projectRoot,
      boulderPath: join(projectRoot, ".omo", "boulder.json"),
      ledgerPath: join(projectRoot, ".omo", "start-work", "ledger.jsonl"),
      work: null,
      ledgerExists: false,
      ledgerLineCount: 0,
      matchedBy: null,
    })
  })

  test("fails closed on malformed boulder JSON", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "lfg-omo-malformed-"))
    await mkdir(join(projectRoot, ".omo"), { recursive: true })
    await writeFile(join(projectRoot, ".omo", "boulder.json"), "{not json", "utf8")

    const summary = await inspectProjectOmoLedger({ projectRoot, sessionId })

    expect(summary).toMatchObject({
      status: "malformed",
      projectRoot,
      work: null,
      ledgerExists: false,
      ledgerLineCount: 0,
      matchedBy: null,
    })
  })

  test("matches active work by grok-prefixed session before other matches", async () => {
    const projectRoot = await projectWithBoulder({
      activeWorkId: "fallback-work",
      works: {
        "grok-work": work({ workId: "grok-work", sessionIds: [`grok:${sessionId}`] }),
        "codex-work": work({ workId: "codex-work", sessionIds: [`codex:${sessionId}`] }),
        "raw-work": work({ workId: "raw-work", sessionIds: [sessionId] }),
        "fallback-work": work({ workId: "fallback-work", sessionIds: [] }),
      },
      ledgerLines: ["one", "two"],
    })

    const summary = await inspectProjectOmoLedger({ projectRoot, sessionId })

    expect(summary).toMatchObject({
      status: "present",
      ledgerExists: true,
      ledgerLineCount: 2,
      matchedBy: "grok-session",
      work: {
        workId: "grok-work",
        planName: "Plan grok-work",
        status: "active",
        activePlan: ".omo/plans/grok-work.md",
        worktreePath: null,
      },
    })
  })

  test("matches active work by codex-prefixed session when grok session is absent", async () => {
    const projectRoot = await projectWithBoulder({
      activeWorkId: "fallback-work",
      works: {
        "codex-work": work({ workId: "codex-work", sessionIds: [`codex:${sessionId}`] }),
        "raw-work": work({ workId: "raw-work", sessionIds: [sessionId] }),
        "fallback-work": work({ workId: "fallback-work", sessionIds: [] }),
      },
      ledgerLines: ["one"],
    })

    const summary = await inspectProjectOmoLedger({ projectRoot, sessionId })

    expect(summary.matchedBy).toBe("codex-session")
    expect(summary.work?.workId).toBe("codex-work")
    expect(summary.ledgerLineCount).toBe(1)
  })

  test("matches active work by opencode-prefixed session when grok and codex sessions are absent", async () => {
    const projectRoot = await projectWithBoulder({
      activeWorkId: "fallback-work",
      works: {
        "opencode-work": work({ workId: "opencode-work", sessionIds: [`opencode:${sessionId}`] }),
        "raw-work": work({ workId: "raw-work", sessionIds: [sessionId] }),
        "fallback-work": work({ workId: "fallback-work", sessionIds: [] }),
      },
      ledgerLines: ["one"],
    })

    const summary = await inspectProjectOmoLedger({ projectRoot, sessionId })

    expect(summary.matchedBy).toBe("opencode-session")
    expect(summary.work?.workId).toBe("opencode-work")
    expect(summary.resumeOptions).toContainEqual({
      workId: "opencode-work",
      planName: "Plan opencode-work",
      status: "active",
      activePlan: ".omo/plans/opencode-work.md",
      worktreePath: null,
      sessionCount: 1,
      awarenessOnly: true,
    })
  })

  test("matches active work by raw session when prefixed sessions are absent", async () => {
    const projectRoot = await projectWithBoulder({
      activeWorkId: "fallback-work",
      works: {
        "raw-work": work({ workId: "raw-work", sessionIds: [sessionId] }),
        "fallback-work": work({ workId: "fallback-work", sessionIds: [] }),
      },
      ledgerLines: [],
    })

    const summary = await inspectProjectOmoLedger({ projectRoot, sessionId })

    expect(summary.matchedBy).toBe("raw-session")
    expect(summary.work?.workId).toBe("raw-work")
    expect(summary.ledgerExists).toBe(false)
    expect(summary.ledgerLineCount).toBe(0)
  })

  test("falls back to active_work_id when no session matches", async () => {
    const projectRoot = await projectWithBoulder({
      activeWorkId: "fallback-work",
      works: {
        "fallback-work": work({ workId: "fallback-work", sessionIds: ["codex:someone-else"], worktreePath: "/tmp/worktree" }),
      },
      ledgerLines: ["alpha", "beta", "gamma"],
    })

    const summary = await inspectProjectOmoLedger({ projectRoot, sessionId })

    expect(summary.matchedBy).toBe("active-work-id")
    expect(summary.work).toMatchObject({
      workId: "fallback-work",
      planName: "Plan fallback-work",
      status: "active",
      activePlan: ".omo/plans/fallback-work.md",
      worktreePath: "/tmp/worktree",
    })
    expect(summary.ledgerLineCount).toBe(3)
  })

  test("matches legacy single-work boulder object", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "lfg-omo-legacy-"))
    await mkdir(join(projectRoot, ".omo"), { recursive: true })
    await writeFile(
      join(projectRoot, ".omo", "boulder.json"),
      `${JSON.stringify(work({ workId: "legacy-work", sessionIds: [`grok:${sessionId}`] }), null, 2)}\n`,
      "utf8",
    )

    const summary = await inspectProjectOmoLedger({ projectRoot, sessionId })

    expect(summary).toMatchObject({
      status: "present",
      matchedBy: "grok-session",
      work: { workId: "legacy-work", activePlan: ".omo/plans/legacy-work.md" },
    })
  })

  test("keeps TypeScript and installed mjs reader behavior in parity", async () => {
    const projectRoot = await projectWithBoulder({
      activeWorkId: "fallback-work",
      works: {
        "fallback-work": work({ workId: "fallback-work", sessionIds: ["codex:someone-else"] }),
      },
      ledgerLines: ["one", "two"],
    })
    const options = { projectRoot, sessionId } satisfies ProjectOmoLedgerOptions

    const tsSummary = await inspectProjectOmoLedger(options)
    const mjsSummary = await inspectProjectOmoLedgerFromMjs(options)

    expect(mjsSummary).toEqual(tsSummary)
  })

  test("reports ulwLoop null when no .omo/ulw-loop directory exists", async () => {
    const projectRoot = await projectWithBoulder({
      activeWorkId: "w1",
      works: { w1: work({ workId: "w1", sessionIds: [] }) },
      ledgerLines: [],
    })

    const summary = await inspectProjectOmoLedger({ projectRoot, sessionId })

    expect(summary.ulwLoop).toBeNull()
  })

  test("reports ulwLoop present=false when .omo/ulw-loop exists but has no sessions", async () => {
    const projectRoot = await projectWithBoulder({
      activeWorkId: "w1",
      works: { w1: work({ workId: "w1", sessionIds: [] }) },
      ledgerLines: [],
    })
    await mkdir(join(projectRoot, ".omo", "ulw-loop"), { recursive: true })

    const summary = await inspectProjectOmoLedger({ projectRoot, sessionId })

    expect(summary.ulwLoop).toEqual({ present: false, sessionCount: 0, hasActiveLedger: false, ledgerPreviews: [] })
  })

  test("reports ulwLoop session count and active ledger presence for real sessions", async () => {
    const projectRoot = await projectWithBoulder({
      activeWorkId: "w1",
      works: { w1: work({ workId: "w1", sessionIds: [] }) },
      ledgerLines: [],
    })
    await mkdir(join(projectRoot, ".omo", "ulw-loop", "019e9705-2774-7683-a928-73d4d7755386"), { recursive: true })
    await mkdir(join(projectRoot, ".omo", "ulw-loop", "019e92ab-5bcc-79e3-8ea6-f68316306da5"), { recursive: true })
    await writeFile(join(projectRoot, ".omo", "ulw-loop", "019e9705-2774-7683-a928-73d4d7755386", "ledger.jsonl"), "line1\n", "utf8")
    // second session has no ledger file

    const summary = await inspectProjectOmoLedger({ projectRoot, sessionId })

    expect(summary.ulwLoop).toEqual({
      present: true,
      sessionCount: 2,
      hasActiveLedger: true,
      ledgerPreviews: [{ source: "ulw-loop", sessionId: "019e9705-2774-7683-a928-73d4d7755386", lineCount: 1, truncated: false }],
    })
    expect(summary.ledgerPreviews).toContainEqual({
      source: "ulw-loop",
      sessionId: "019e9705-2774-7683-a928-73d4d7755386",
      lineCount: 1,
      truncated: false,
    })
  })

  test("reports only allowlisted ledger metadata without leaking ledger text", async () => {
    const projectRoot = await projectWithBoulder({
      activeWorkId: "w1",
      works: { w1: work({ workId: "w1", sessionIds: [`grok:${sessionId}`] }) },
      ledgerLines: [
        '{"event":"tool","api_key":"sk-test-secret","prompt":"do not leak this prompt"}',
        "Authorization: Bearer abcdefghijklmnopqrstuvwxyz",
      ],
    })

    const summary = await inspectProjectOmoLedger({ projectRoot, sessionId })
    const rendered = JSON.stringify(summary)

    expect(summary.ledgerPreviews).toContainEqual({
      source: "start-work",
      sessionId: null,
      lineCount: 2,
      truncated: false,
    })
    expect(rendered).not.toContain("sk-test-secret")
    expect(rendered).not.toContain("Authorization")
    expect(rendered).not.toContain("do not leak this prompt")
  })
})

type MjsReader = {
  readonly inspectProjectOmoLedger: (options: ProjectOmoLedgerOptions) => Promise<ProjectOmoLedgerSummary>
}

type BoulderWork = {
  readonly work_id: string
  readonly active_plan: string
  readonly plan_name: string
  readonly session_ids: readonly string[]
  readonly status: string
  readonly worktree_path: string | null
}

async function inspectProjectOmoLedgerFromMjs(options: ProjectOmoLedgerOptions): Promise<ProjectOmoLedgerSummary> {
  const moduleUrl = pathToFileURL(join(import.meta.dirname, "assets", "lfg-project-omo-ledger.mjs")).href
  const reader: unknown = await import(moduleUrl)
  if (!isMjsReader(reader)) {
    throw new TypeError("lfg-project-omo-ledger.mjs did not export inspectProjectOmoLedger")
  }
  return reader.inspectProjectOmoLedger(options)
}

function isMjsReader(value: unknown): value is MjsReader {
  return typeof value === "object"
    && value !== null
    && "inspectProjectOmoLedger" in value
    && typeof value.inspectProjectOmoLedger === "function"
}

async function projectWithBoulder(options: {
  readonly activeWorkId: string
  readonly works: Record<string, BoulderWork>
  readonly ledgerLines: readonly string[]
}): Promise<string> {
  const projectRoot = await mkdtemp(join(tmpdir(), "lfg-omo-present-"))
  await mkdir(join(projectRoot, ".omo", "start-work"), { recursive: true })
  await writeFile(
    join(projectRoot, ".omo", "boulder.json"),
    `${JSON.stringify({ schema_version: 2, active_work_id: options.activeWorkId, works: options.works }, null, 2)}\n`,
    "utf8",
  )
  if (options.ledgerLines.length > 0) {
    await writeFile(join(projectRoot, ".omo", "start-work", "ledger.jsonl"), `${options.ledgerLines.join("\n")}\n`, "utf8")
  }
  return projectRoot
}

function work(options: {
  readonly workId: string
  readonly sessionIds: readonly string[]
  readonly worktreePath?: string | null
}): BoulderWork {
  return {
    work_id: options.workId,
    active_plan: `.omo/plans/${options.workId}.md`,
    plan_name: `Plan ${options.workId}`,
    session_ids: options.sessionIds,
    status: "active",
    worktree_path: options.worktreePath ?? null,
  }
}
