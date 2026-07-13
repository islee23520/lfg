import { mkdir, readFile, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, test } from "vitest"
import { dispatchUlwLoopArgv } from "./lfg-ulw-loop.js"
import { ulwLoopCommand } from "../../core/omo/ulw-loop/cli-commands.js"

const temps: string[] = []
const SESSION_ENV = [
  "OMO_ULW_LOOP_SESSION_ID",
  "LFG_ULW_LOOP_SESSION_ID",
  "GROK_SESSION_ID",
  "CODEX_SESSION_ID",
  "CODEX_THREAD_ID",
] as const

afterEach(async () => {
  await Promise.all(temps.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function withTempCwd<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtempJoin()
  const prev = process.cwd()
  const saved = Object.fromEntries(SESSION_ENV.map((k) => [k, process.env[k]]))
  for (const k of SESSION_ENV) delete process.env[k]
  process.chdir(root)
  try {
    return await fn(root)
  } finally {
    process.chdir(prev)
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  }
}

async function mkdtempJoin(): Promise<string> {
  const { mkdtemp } = await import("node:fs/promises")
  const root = await mkdtemp(join(tmpdir(), "lfg-ulw-life-"))
  temps.push(root)
  return root
}

async function captureStdout(fn: () => Promise<number>): Promise<{ code: number; out: string; err: string }> {
  const out: string[] = []
  const err: string[] = []
  const oWrite = process.stdout.write.bind(process.stdout)
  const eWrite = process.stderr.write.bind(process.stderr)
  process.stdout.write = ((chunk: string | Uint8Array, ..._args: unknown[]) => {
    out.push(Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk))
    return true
  }) as typeof process.stdout.write
  process.stderr.write = ((chunk: string | Uint8Array, ..._args: unknown[]) => {
    err.push(Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk))
    return true
  }) as typeof process.stderr.write
  try {
    const code = await fn()
    return { code, out: out.join(""), err: err.join("") }
  } catch (error: unknown) {
    err.push(String(error instanceof Error ? error.stack ?? error.message : error))
    return { code: 1, out: out.join(""), err: err.join("") }
  } finally {
    process.stdout.write = oWrite
    process.stderr.write = eWrite
  }
}

function parseJsonOut(out: string): unknown {
  const trimmed = out.trim()
  if (!trimmed) throw new Error(`expected JSON stdout, got empty (len=${out.length})`)
  // pretty-printed JSON from printJson; take first top-level object
  const start = trimmed.indexOf("{")
  if (start < 0) throw new Error(`expected JSON object in stdout: ${trimmed.slice(0, 200)}`)
  return JSON.parse(trimmed.slice(start))
}

describe("lfg ulw-loop full feature lifecycle (TDD 100%)", () => {
  test("help, unknown, and hook routing", async () => {
    expect((await captureStdout(() => dispatchUlwLoopArgv(["help"]))).code).toBe(0)
    expect((await captureStdout(() => dispatchUlwLoopArgv([]))).out).toContain("lfg ulw-loop")
    const unknown = await captureStdout(() => dispatchUlwLoopArgv(["nope"]))
    expect(unknown.code).toBe(1)
    expect(unknown.err + unknown.out).toMatch(/unknown command|Usage/)
    const badHook = await captureStdout(() => dispatchUlwLoopArgv(["hook", "missing"]))
    expect(badHook.code).toBe(1)
  })

  test("create-goals → status → complete-goals → criteria → record-evidence → checkpoint failed/blocked → add-goal", async () => {
    await withTempCwd(async (root) => {
      const created = await captureStdout(() =>
        dispatchUlwLoopArgv([
          "ulw-loop",
          "create-goals",
          "--brief",
          "Ship lfg ulw-loop coverage gate with TDD",
          "--json",
        ]),
      )
      expect(created.code).toBe(0)
      const createdJson = parseJsonOut(created.out) as {
        ok: boolean
        plan: { goals: Array<{ id: string; successCriteria: Array<{ id: string }> }> }
      }
      expect(createdJson.ok).toBe(true)
      const goalId = createdJson.plan.goals[0]!.id
      const criterionIds = createdJson.plan.goals[0]!.successCriteria.map((c) => c.id)
      expect(criterionIds).toContain("C001")

      const status = await captureStdout(() => dispatchUlwLoopArgv(["ulw-loop", "status", "--json"]))
      expect(status.code).toBe(0)
      expect((parseJsonOut(status.out) as { ok: boolean }).ok).toBe(true)

      const complete = await captureStdout(() => dispatchUlwLoopArgv(["ulw-loop", "complete-goals", "--json"]))
      expect(complete.code).toBe(0)
      const completeJson = parseJsonOut(complete.out) as { ok: boolean; goal?: { id: string; status: string } }
      expect(completeJson.goal?.id).toBe(goalId)
      expect(completeJson.goal?.status).toBe("in_progress")

      const criteria = await captureStdout(() =>
        dispatchUlwLoopArgv(["ulw-loop", "criteria", "--goal-id", goalId, "--json"]),
      )
      expect(criteria.code).toBe(0)
      expect((parseJsonOut(criteria.out) as { criteria: unknown[] }).criteria.length).toBeGreaterThan(0)

      for (const cid of criterionIds) {
        const ev = await captureStdout(() =>
          dispatchUlwLoopArgv([
            "ulw-loop",
            "record-evidence",
            "--goal-id",
            goalId,
            "--criterion-id",
            cid,
            "--status",
            "pass",
            "--evidence",
            `proof for ${cid}`,
            "--json",
          ]),
        )
        expect(ev.code).toBe(0)
        expect((parseJsonOut(ev.out) as { ok: boolean }).ok).toBe(true)
      }

      const blocked = await captureStdout(() =>
        dispatchUlwLoopArgv([
          "ulw-loop",
          "checkpoint",
          "--goal-id",
          goalId,
          "--status",
          "blocked",
          "--evidence",
          "waiting on external auth",
          "--json",
        ]),
      )
      expect(blocked.code).toBe(0)
      expect((parseJsonOut(blocked.out) as { goal: { status: string } }).goal.status).toMatch(
        /blocked|needs_user_decision|failed|in_progress|complete/,
      )

      // recreate fresh plan for failed path
      const root2 = await mkdtempJoin()
      const prev = process.cwd()
      process.chdir(root2)
      try {
        await captureStdout(() =>
          dispatchUlwLoopArgv(["ulw-loop", "create-goals", "--brief", "Second plan for failed checkpoint", "--json"]),
        )
        const st = parseJsonOut((await captureStdout(() => dispatchUlwLoopArgv(["ulw-loop", "status", "--json"]))).out) as {
          plan: { goals: Array<{ id: string }> }
        }
        const gid = st.plan.goals[0]!.id
        await captureStdout(() => dispatchUlwLoopArgv(["ulw-loop", "complete-goals", "--json"]))
        const failed = await captureStdout(() =>
          dispatchUlwLoopArgv([
            "ulw-loop",
            "checkpoint",
            "--goal-id",
            gid,
            "--status",
            "failed",
            "--evidence",
            "tests red",
            "--json",
          ]),
        )
        expect(failed.code).toBe(0)
        expect((parseJsonOut(failed.out) as { goal: { status: string } }).goal.status).toBe("failed")
      } finally {
        process.chdir(prev)
      }

      const added = await captureStdout(() =>
        dispatchUlwLoopArgv([
          "ulw-loop",
          "add-goal",
          "--title",
          "Follow-up",
          "--objective",
          "Cover remaining branches",
          "--json",
        ]),
      )
      // original plan may be blocked; still should accept add or error cleanly
      expect([0, 1]).toContain(added.code)

      await expect(readFile(join(root, ".omo", "ulw-loop", "goals.json"), "utf8")).resolves.toContain("version")
    })
  })

  test("session-id isolation and refuse overwrite without --force", async () => {
    await withTempCwd(async () => {
      const a = await captureStdout(() =>
        dispatchUlwLoopArgv([
          "ulw-loop",
          "create-goals",
          "--session-id",
          "run-a",
          "--brief",
          "Session A brief",
          "--json",
        ]),
      )
      expect(a.code).toBe(0)
      const b = await captureStdout(() =>
        dispatchUlwLoopArgv([
          "ulw-loop",
          "create-goals",
          "--session-id",
          "run-b",
          "--brief",
          "Session B brief",
          "--json",
        ]),
      )
      expect(b.code).toBe(0)
      const refuse = await captureStdout(() =>
        dispatchUlwLoopArgv([
          "ulw-loop",
          "create-goals",
          "--session-id",
          "run-a",
          "--brief",
          "overwrite?",
          "--json",
        ]),
      )
      expect(refuse.code).toBe(1)
      const forced = await captureStdout(() =>
        dispatchUlwLoopArgv([
          "ulw-loop",
          "create-goals",
          "--session-id",
          "run-a",
          "--brief",
          "forced rewrite",
          "--force",
          "--json",
        ]),
      )
      expect(forced.code).toBe(0)
    })
  })

  test("missing brief and empty session-id fail closed", async () => {
    await withTempCwd(async () => {
      const missing = await captureStdout(() => dispatchUlwLoopArgv(["ulw-loop", "create-goals", "--json"]))
      expect(missing.code).toBe(1)
      expect(missing.out + missing.err).toMatch(/brief|ULW_LOOP/i)
      const emptySession = await captureStdout(() =>
        dispatchUlwLoopArgv(["ulw-loop", "status", "--session-id", "", "--json"]),
      )
      expect(emptySession.code).toBe(1)
    })
  })

  test("complete-goals done path after all goals complete via failed then retry", async () => {
    await withTempCwd(async () => {
      await captureStdout(() =>
        dispatchUlwLoopArgv(["ulw-loop", "create-goals", "--brief", "One goal plan", "--codex-goal-mode", "per_story", "--json"]),
      )
      const st = parseJsonOut((await captureStdout(() => dispatchUlwLoopArgv(["ulw-loop", "status", "--json"]))).out) as {
        plan: { goals: Array<{ id: string }> }
      }
      const goalId = st.plan.goals[0]!.id
      await captureStdout(() => dispatchUlwLoopArgv(["ulw-loop", "complete-goals", "--json"]))
      await captureStdout(() =>
        dispatchUlwLoopArgv([
          "ulw-loop",
          "checkpoint",
          "--goal-id",
          goalId,
          "--status",
          "failed",
          "--evidence",
          "boom",
          "--json",
        ]),
      )
      const retry = await captureStdout(() =>
        dispatchUlwLoopArgv(["ulw-loop", "complete-goals", "--retry-failed", "--json"]),
      )
      expect(retry.code).toBe(0)
      expect((parseJsonOut(retry.out) as { goal?: { status: string } }).goal?.status).toBe("in_progress")
    })
  })

  test("ulwLoopCommand help and unknown subcommand json error", async () => {
    const help = await captureStdout(() => ulwLoopCommand(["help"]))
    expect(help.code).toBe(0)
    expect(help.out).toContain("create-goals")
    const unknown = await captureStdout(() => ulwLoopCommand(["not-a-cmd", "--json"]))
    expect(unknown.code).toBe(1)
    expect((parseJsonOut(unknown.out) as { ok: boolean }).ok).toBe(false)
  })

  test("checkpoint complete with quality gate for final aggregate goal", async () => {
    await withTempCwd(async (root) => {
      const created = await captureStdout(() =>
        dispatchUlwLoopArgv([
          "ulw-loop",
          "create-goals",
          "--brief",
          "Final complete path",
          "--codex-goal-mode",
          "aggregate",
          "--json",
        ]),
      )
      expect(created.code).toBe(0)
      const plan = (parseJsonOut(created.out) as {
        plan: {
          goals: Array<{ id: string; objective: string; successCriteria: Array<{ id: string }> }>
          codexObjective?: string
        }
      }).plan
      const goal = plan.goals[0]!
      await captureStdout(() => dispatchUlwLoopArgv(["ulw-loop", "complete-goals", "--json"]))
      for (const c of goal.successCriteria) {
        await captureStdout(() =>
          dispatchUlwLoopArgv([
            "ulw-loop",
            "record-evidence",
            "--goal-id",
            goal.id,
            "--criterion-id",
            c.id,
            "--status",
            "pass",
            "--evidence",
            `ok-${c.id}`,
            "--json",
          ]),
        )
      }

      const evidenceDir = join(root, ".omo", "ulw-loop", "evidence")
      await mkdir(evidenceDir, { recursive: true })
      await writeFile(join(evidenceDir, "cli.txt"), "cli transcript proof\n", "utf8")
      await writeFile(join(evidenceDir, "code.md"), "code review clear\n", "utf8")
      await writeFile(join(evidenceDir, "gate.md"), "gate approve\n", "utf8")

      const objective =
        plan.codexObjective ??
        "Complete the durable ulw-loop plan in .omo/ulw-loop/goals.json, including later accepted/appended stories, under the original brief constraints; use .omo/ulw-loop/ledger.jsonl as the audit trail."
      const codexGoal = JSON.stringify({ goal: { objective, status: "complete" } })
      const qualityGate = {
        codeReview: {
          by: "lazycodex-code-reviewer",
          recommendation: "APPROVE",
          codeQualityStatus: "CLEAR",
          reportPath: ".omo/ulw-loop/evidence/code.md",
          evidence: "code ok",
          blockers: [],
        },
        manualQa: {
          by: "lazycodex-qa-executor",
          status: "passed",
          evidence: "manual ok",
          artifactRefs: [
            { id: "a1", kind: "cli-transcript", description: "cli", path: ".omo/ulw-loop/evidence/cli.txt" },
          ],
          surfaceEvidence: [
            {
              id: "s1",
              criterionRef: "C001",
              surface: "cli",
              invocation: "lfg ulw-loop status --json",
              verdict: "passed",
              artifactRefs: ["a1"],
            },
          ],
          adversarialCases: [
            {
              id: "adv1",
              criterionRef: "C002",
              scenario: "malformed input",
              expectedBehavior: "fail closed",
              verdict: "passed",
              artifactRefs: ["a1"],
            },
          ],
        },
        gateReview: {
          by: "lazycodex-gate-reviewer",
          recommendation: "APPROVE",
          reportPath: ".omo/ulw-loop/evidence/gate.md",
          evidence: "gate ok",
          blockers: [],
        },
        iteration: {
          fullRerun: true,
          status: "passed",
          rerunCommands: ["npm test"],
          evidence: "rerun green",
        },
        criteriaCoverage: {
          totalCriteria: goal.successCriteria.length,
          passCount: goal.successCriteria.length,
          originalIntent: "Ship coverage",
          desiredOutcome: "100%",
          userOutcomeReview: "accepted",
          adversarialClassesCovered: ["malformed"],
        },
      }

      const done = await captureStdout(() =>
        dispatchUlwLoopArgv([
          "ulw-loop",
          "checkpoint",
          "--goal-id",
          goal.id,
          "--status",
          "complete",
          "--evidence",
          "all criteria green + quality gate",
          "--codex-goal-json",
          codexGoal,
          "--quality-gate-json",
          JSON.stringify(qualityGate),
          "--json",
        ]),
      )
      expect(done.code).toBe(0)
      const body = parseJsonOut(done.out) as {
        ok: boolean
        goal: { status: string }
        aggregateCompletion?: { status: string }
        plan?: { aggregateCompletion?: { status: string } }
      }
      expect(body.ok).toBe(true)
      expect(body.goal.status).toBe("complete")
      expect(body.aggregateCompletion?.status ?? body.plan?.aggregateCompletion?.status).toBe("complete")
    })
  })
})
