import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, test } from "vitest"
import { createUlwLoopPlan, startNextUlwLoop, summarizeUlwLoopPlan } from "./plan-crud.js"
import { recordEvidence } from "./evidence.js"
import { recordFinalReviewBlockers } from "./review-blockers.js"
import { printJsonError, printStatus, blockedDecisionHandoff } from "./cli-output.js"
import { hasFlag, parseCodexGoalJson, readJsonInput, readRepeated, readValue } from "./cli-arg-parser.js"
import { parseCodexGoalSnapshot, readCodexGoalSnapshotInput, reconcileCodexGoalSnapshot } from "./codex-goal-snapshot.js"
import { UlwLoopError } from "./runtime.js"
import { readUlwLoopPlan } from "./plan-io.js"
import { steerUlwLoop } from "./steering.js"
import { parseSteeringProposal } from "./cli-steering.js"
import { buildCodexGoalInstruction } from "./codex-goal-instruction.js"
import { canReconcileCompletedTaskScopedAggregateSnapshot, buildTaskScopedAggregateReconciliationHint } from "./checkpoint-reconciliation.js"
import {
  isFinalRunCompletionCandidate,
  isUlwLoopDone,
  hasAllCriteriaPass,
} from "./goal-status.js"

const temps: string[] = []
afterEach(async () => {
  await Promise.all(temps.splice(0).map((d) => rm(d, { recursive: true, force: true })))
})

async function root(): Promise<string> {
  const r = await mkdtemp(join(tmpdir(), "lfg-ulw-rem-"))
  temps.push(r)
  return r
}

function capture(fn: () => void): string {
  const chunks: string[] = []
  const o = process.stdout.write.bind(process.stdout)
  process.stdout.write = ((c: string | Uint8Array) => {
    chunks.push(String(c))
    return true
  }) as typeof process.stdout.write
  try {
    fn()
  } finally {
    process.stdout.write = o
  }
  return chunks.join("")
}

describe("ulw-loop remaining surface coverage", () => {
  test("printStatus, printJsonError, blockedDecisionHandoff", () => {
    const plan = {
      version: 1 as const,
      createdAt: "t",
      updatedAt: "t",
      briefPath: "b",
      goalsPath: "g",
      ledgerPath: "l",
      activeGoalId: "G001",
      goals: [
        {
          id: "G001",
          title: "T",
          objective: "O",
          status: "in_progress" as const,
          successCriteria: [
            {
              id: "C001",
              scenario: "s",
              userModel: "happy" as const,
              expectedEvidence: "e",
              essential: true,
              capturedEvidence: null,
              status: "pass" as const,
            },
          ],
          attempt: 1,
          createdAt: "t",
          updatedAt: "t",
        },
      ],
    }
    const out = capture(() => printStatus(plan))
    expect(out).toContain("ulw-loop status")
    expect(out).toContain("G001")
    expect(blockedDecisionHandoff(plan)).toBe("")
    const blockedPlan = {
      ...plan,
      goals: [
        {
          ...plan.goals[0]!,
          status: "needs_user_decision" as const,
          nonRetriable: true,
          requiredExternalDecision: "approve deploy",
        },
      ],
    }
    expect(blockedDecisionHandoff(blockedPlan)).toContain("approve deploy")
    const errOut = capture(() => printJsonError(new UlwLoopError("nope", "X", { details: { a: 1 } })))
    expect(errOut).toContain('"ok": false')
    expect(errOut).toContain("nope")
    expect(capture(() => printJsonError(new Error("plain")))).toContain("ULW_LOOP_UNEXPECTED")
    expect(capture(() => printJsonError(42))).toContain("ULW_LOOP_UNKNOWN")
  })

  test("arg-parser json inputs and repeated flags", async () => {
    expect(hasFlag(["--json"], "--json")).toBe(true)
    expect(readValue(["--a=1"], "--a")).toBe("1")
    expect(readRepeated(["--t", "1", "--t", "2"], "--t")).toEqual(["1", "2"])
    expect(await parseCodexGoalJson(undefined)).toBeUndefined()
    expect(await parseCodexGoalJson('{"ok":true}')).toContain("ok")
    await expect(parseCodexGoalJson("{")).rejects.toThrow(UlwLoopError)
    expect(await readJsonInput(undefined)).toBeUndefined()
    expect(await readJsonInput('{"a":1}')).toEqual({ a: 1 })
  })

  test("codex snapshot from file path", async () => {
    const r = await root()
    const path = join(r, "snap.json")
    await writeFile(path, JSON.stringify({ goal: { objective: "Ship", status: "active" } }), "utf8")
    const snap = await readCodexGoalSnapshotInput(path, r)
    expect(snap?.available).toBe(true)
    expect(snap?.status).toBe("active")
    await expect(readCodexGoalSnapshotInput("not-json-and-missing", r)).rejects.toThrow()
    const rec = reconcileCodexGoalSnapshot(parseCodexGoalSnapshot(null), {
      expectedObjective: "x",
      requireSnapshot: true,
    })
    expect(rec.ok).toBe(false)
  })

  test("evidence pass/fail/blocked + summarize", async () => {
    const r = await root()
    const plan = await createUlwLoopPlan(r, { brief: "Evidence surface\n" })
    const goal = plan.goals[0]!
    const c1 = goal.successCriteria[0]!.id
    const pass = await recordEvidence(r, {
      goalId: goal.id,
      criterionId: c1,
      status: "pass",
      evidence: "green",
      notes: "n",
    })
    expect(pass.criterion.status).toBe("pass")
    const c2 = goal.successCriteria[1]!.id
    await recordEvidence(r, { goalId: goal.id, criterionId: c2, status: "fail", evidence: "red" })
    const c3 = goal.successCriteria[2]!.id
    await recordEvidence(r, { goalId: goal.id, criterionId: c3, status: "blocked", evidence: "wait" })
    const reloaded = await readUlwLoopPlan(r)
    const summary = summarizeUlwLoopPlan(reloaded)
    expect(summary.criteria.pass).toBeGreaterThanOrEqual(1)
    expect(summary.criteria.fail + summary.criteria.blocked).toBeGreaterThanOrEqual(1)
    await expect(
      recordEvidence(r, { goalId: "NOPE", criterionId: "C001", status: "pass", evidence: "x" }),
    ).rejects.toThrow(/not found/i)
    await expect(
      recordEvidence(r, { goalId: goal.id, criterionId: "CXXX", status: "pass", evidence: "x" }),
    ).rejects.toThrow(/criterion/i)
    await expect(
      recordEvidence(r, { goalId: goal.id, criterionId: c1, status: "pass", evidence: "   " }),
    ).rejects.toThrow(/Evidence/i)
  })

  test("record-review-blockers on final in_progress goal", async () => {
    const r = await root()
    const plan = await createUlwLoopPlan(r, { brief: "Final review blockers\n", codexGoalMode: "aggregate" })
    const started = await startNextUlwLoop(r)
    if (!("goal" in started)) throw new Error("expected goal")
    const goal = started.goal
    expect(isFinalRunCompletionCandidate(started.plan, goal)).toBe(true)
    for (const c of goal.successCriteria) {
      // not required for review_blocked path
      void c
    }
    const objective =
      plan.codexObjective ??
      "Complete the durable ulw-loop plan in .omo/ulw-loop/goals.json, including later accepted/appended stories, under the original brief constraints; use .omo/ulw-loop/ledger.jsonl as the audit trail."
    const result = await recordFinalReviewBlockers(r, {
      goalId: goal.id,
      title: "Unblock QA",
      objective: "Fix remaining QA gaps",
      evidence: "review found issues",
      codexGoalJson: JSON.stringify({ goal: { objective, status: "active" } }),
    })
    expect(result.blockedGoal.status).toBe("review_blocked")
    expect(result.newGoal.id).not.toBe(goal.id)
    expect(result.ledgerEntries.length).toBeGreaterThan(0)
  })

  test("steering add_subgoal and revise_pending_wording", async () => {
    const r = await root()
    await createUlwLoopPlan(r, { brief: "Steering kinds\n" })
    const add = await steerUlwLoop(r, {
      kind: "add_subgoal",
      source: "cli",
      title: "Child",
      objective: "Do child work",
      evidence: "need split",
      rationale: "scope too large",
    })
    expect(add.accepted).toBe(true)
    const plan = await readUlwLoopPlan(r)
    const pending = plan.goals.find((g) => g.status === "pending")
    expect(pending).toBeDefined()
    const rev = await parseSteeringProposal([
      "--kind",
      "revise_pending_wording",
      "--goal-id",
      pending!.id,
      "--title",
      "Renamed",
      "--evidence",
      "clarity",
      "--rationale",
      "clearer title",
    ])
    const renamed = await steerUlwLoop(r, rev)
    expect(renamed.accepted).toBe(true)
  })

  test("buildCodexGoalInstruction emits text", async () => {
    const r = await root()
    const plan = await createUlwLoopPlan(r, { brief: "Instruction brief\n" })
    const started = await startNextUlwLoop(r)
    if (!("goal" in started)) throw new Error("expected goal")
    const inst = buildCodexGoalInstruction({ plan: started.plan, goal: started.goal })
    expect(inst.text.length).toBeGreaterThan(10)
    expect(isUlwLoopDone(plan)).toBe(false)
  })

  test("checkpoint reconciliation helpers exist and return strings", async () => {
    const r = await root()
    const plan = await createUlwLoopPlan(r, { brief: "recon\n" })
    const goal = plan.goals[0]!
    const hint = buildTaskScopedAggregateReconciliationHint(goal, true)
    expect(hint.length).toBeGreaterThan(0)
    const can = await canReconcileCompletedTaskScopedAggregateSnapshot(
      r,
      plan,
      goal,
      "some other objective",
      "evidence path",
      undefined,
    )
    expect(typeof can).toBe("boolean")
  })

  test("hasAllCriteriaPass after all pass", async () => {
    const r = await root()
    const plan = await createUlwLoopPlan(r, { brief: "all pass\n" })
    const goal = plan.goals[0]!
    for (const c of goal.successCriteria) {
      await recordEvidence(r, {
        goalId: goal.id,
        criterionId: c.id,
        status: "pass",
        evidence: `ok-${c.id}`,
      })
    }
    const reloaded = await readUlwLoopPlan(r)
    expect(hasAllCriteriaPass(reloaded.goals[0]!)).toBe(true)
  })
})
