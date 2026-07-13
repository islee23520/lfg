import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, test } from "vitest"
import { createUlwLoopPlan, startNextUlwLoop, addUlwLoopGoal } from "./plan-crud.js"
import { recordEvidence } from "./evidence.js"
import { checkpointUlwLoop } from "./checkpoint.js"
import { readUlwLoopPlan, readSteeringLedgerEntries } from "./plan-io.js"
import { parseSteeringProposal } from "./cli-steering.js"
import { steerUlwLoop } from "./steering.js"
import { isFinalRunCompletionCandidate, isUlwLoopDone, essentialCriteriaOf } from "./goal-status.js"
import { UlwLoopError } from "./runtime.js"
import { validateQualityGate } from "./quality-gate.js"
import { existsSync } from "node:fs"
import { textField, numberField, stringArray, section, literal, emptyBlockers, invalid } from "./quality-gate-fields.js"
import { parseCodexGoalSnapshot, reconcileCodexGoalSnapshot, readCodexGoalSnapshotInput } from "./codex-goal-snapshot.js"
import { readValue, readJsonInput, parseRecordEvidenceArgs } from "./cli-arg-parser.js"
import { ulwLoopCommand } from "./cli-commands.js"

const temps: string[] = []
afterEach(async () => {
  await Promise.all(temps.splice(0).map((d) => rm(d, { recursive: true, force: true })))
})

async function root(): Promise<string> {
  const r = await mkdtemp(join(tmpdir(), "lfg-ulw-gap-"))
  temps.push(r)
  return r
}

async function capture(fn: () => Promise<number>): Promise<{ code: number; out: string; err: string }> {
  const out: string[] = []
  const err: string[] = []
  const ow = process.stdout.write.bind(process.stdout)
  const ew = process.stderr.write.bind(process.stderr)
  process.stdout.write = ((c: string | Uint8Array) => {
    out.push(String(c))
    return true
  }) as typeof process.stdout.write
  process.stderr.write = ((c: string | Uint8Array) => {
    err.push(String(c))
    return true
  }) as typeof process.stderr.write
  try {
    return { code: await fn(), out: out.join(""), err: err.join("") }
  } finally {
    process.stdout.write = ow
    process.stderr.write = ew
  }
}

describe("ulw-loop gap-fill toward 100%", () => {
  test("checkpoint failed/blocked paths and complete mismatch error", async () => {
    const r = await root()
    await createUlwLoopPlan(r, { brief: "checkpoint gaps\n" })
    const started = await startNextUlwLoop(r)
    if (!("goal" in started)) throw new Error("need goal")
    const goal = started.goal

    const failed = await checkpointUlwLoop(r, {
      goalId: goal.id,
      status: "failed",
      evidence: "tests red",
    })
    expect(failed.goal.status).toBe("failed")

    await createUlwLoopPlan(r, { brief: "blocked path\n", force: true })
    const s2 = await startNextUlwLoop(r)
    if (!("goal" in s2)) throw new Error("need goal")
    const blocked = await checkpointUlwLoop(r, {
      goalId: s2.goal.id,
      status: "blocked",
      evidence: "missing auth token for package pull",
    })
    expect(["blocked", "needs_user_decision", "failed"]).toContain(blocked.goal.status)

    // complete with wrong codex objective → error
    await createUlwLoopPlan(r, { brief: "mismatch complete\n", force: true })
    const s3 = await startNextUlwLoop(r)
    if (!("goal" in s3)) throw new Error("need goal")
    for (const c of s3.goal.successCriteria) {
      await recordEvidence(r, {
        goalId: s3.goal.id,
        criterionId: c.id,
        status: "pass",
        evidence: `ok-${c.id}`,
      })
    }
    await expect(
      checkpointUlwLoop(r, {
        goalId: s3.goal.id,
        status: "complete",
        evidence: "implementation done and tests passed green",
        codexGoalJson: JSON.stringify({ goal: { objective: "totally different objective", status: "complete" } }),
      }),
    ).rejects.toThrow()
  })

  test("cli-steering more kinds + non-json printSteer", async () => {
    const r = await root()
    await createUlwLoopPlan(r, { brief: "- A goal alpha\n- B goal beta\n" })
    const plan = await readUlwLoopPlan(r)
    const g = plan.goals[0]!
    const split = await parseSteeringProposal([
      "--kind",
      "split_subgoal",
      "--goal-id",
      g.id,
      "--children",
      JSON.stringify([
        { title: "A1", objective: "a1" },
        { title: "A2", objective: "a2" },
      ]),
      "--evidence",
      "e",
      "--rationale",
      "r",
    ])
    expect(split.kind).toBe("split_subgoal")
    const applied = await steerUlwLoop(r, split)
    expect(applied.accepted).toBe(true)

    const order = await parseSteeringProposal([
      "--kind",
      "reorder_pending",
      "--order",
      JSON.stringify(
        (await readUlwLoopPlan(r)).goals
          .filter((x) => x.status === "pending" && !x.steeringStatus)
          .map((x) => x.id)
          .reverse(),
      ),
      "--evidence",
      "e",
      "--rationale",
      "r",
    ])
    if ((order.pendingOrder?.length ?? 0) > 0) {
      expect((await steerUlwLoop(r, order)).accepted).toBe(true)
    }

    const mark = await parseSteeringProposal([
      "--kind",
      "mark_blocked_superseded",
      "--goal-id",
      (await readUlwLoopPlan(r)).goals.find((x) => x.status === "pending" && !x.steeringStatus)!.id,
      "--evidence",
      "blocked",
      "--rationale",
      "wait",
    ])
    expect((await steerUlwLoop(r, mark)).accepted).toBe(true)
  })

  test("quality-gate-fields helpers and multi-surface gate", () => {
    expect(textField(" hi ", "f")).toBe("hi")
    expect(() => textField("", "f")).toThrow()
    expect(numberField(3, "n")).toBe(3)
    expect(() => numberField("x", "n")).toThrow()
    expect(stringArray(["a", "b"], "s")).toEqual(["a", "b"])
    expect(() => stringArray("no", "s")).toThrow()
    expect(section({ a: 1 }, "s")).toEqual({ a: 1 })
    expect(() => section(null, "s")).toThrow()
    expect(literal("APPROVE", "APPROVE", "f")).toBe("APPROVE")
    expect(() => literal("x", "APPROVE", "f")).toThrow()
    expect(emptyBlockers([], "b")).toEqual([])
    expect(() => emptyBlockers(["x"], "b")).toThrow()
    expect(() => invalid("msg", "f")).toThrow()

    const r = "/tmp"
    const gate = validateQualityGate(
      {
        codeReview: {
          by: "lazycodex-code-reviewer",
          recommendation: "APPROVE",
          codeQualityStatus: "CLEAR",
          reportPath: "rep.md",
          evidence: "e",
          blockers: [],
        },
        manualQa: {
          by: "lazycodex-qa-executor",
          status: "passed",
          evidence: "e",
          artifactRefs: [
            { id: "http1", kind: "http-dump", description: "http", path: "h.txt" },
            { id: "img1", kind: "screenshot", description: "ss", path: "s.png" },
            { id: "data1", kind: "data-diff", description: "db", path: "d.txt" },
          ],
          surfaceEvidence: [
            {
              id: "s1",
              criterionRef: "C001",
              surface: "http",
              invocation: "curl",
              verdict: "passed",
              artifactRefs: ["http1"],
            },
            {
              id: "s2",
              criterionRef: "C002",
              surface: "browser",
              invocation: "open",
              verdict: "passed",
              artifactRefs: ["img1"],
            },
            {
              id: "s3",
              criterionRef: "C003",
              surface: "data",
              invocation: "diff",
              verdict: "passed",
              artifactRefs: ["data1"],
            },
          ],
          adversarialCases: [
            {
              id: "a1",
              criterionRef: "C001",
              scenario: "s",
              expectedBehavior: "e",
              verdict: "passed",
              artifactRefs: ["http1"],
            },
          ],
        },
        gateReview: {
          by: "lazycodex-gate-reviewer",
          recommendation: "APPROVE",
          reportPath: "g.md",
          evidence: "e",
          blockers: [],
        },
        iteration: {
          fullRerun: true,
          status: "passed",
          rerunCommands: ["npm test"],
          evidence: "e",
        },
        criteriaCoverage: {
          totalCriteria: 3,
          passCount: 3,
          originalIntent: "i",
          desiredOutcome: "o",
          userOutcomeReview: "u",
          adversarialClassesCovered: ["c"],
        },
      },
      // no fs checks when paths are not verified if fs not provided for missing files - actually checkFile only if opts
    )
    expect(gate.manualQa.surfaceEvidence).toHaveLength(3)
    void r
    void existsSync
  })

  test("goal-status essentialCriteriaOf happy fallback and multi-goal final candidate", async () => {
    const r = await root()
    await createUlwLoopPlan(r, { brief: "- G1\n- G2\n" })
    await addUlwLoopGoal(r, { title: "Extra", objective: "more work" })
    const plan = await readUlwLoopPlan(r)
    // strip essential flags to force happy fallback (clone mutable criteria)
    const g = plan.goals[0]!
    const mutableCriteria = g.successCriteria.map((c) => ({ ...c, essential: false as boolean }))
    mutableCriteria[0] = { ...mutableCriteria[0]!, userModel: "happy" as const, essential: false }
    const gMut = { ...g, successCriteria: mutableCriteria }
    expect(essentialCriteriaOf(gMut).length).toBe(1)
    // only last incomplete is final candidate
    plan.goals[0]!.status = "complete"
    plan.goals[1]!.status = "complete"
    const last = plan.goals[2]!
    expect(isFinalRunCompletionCandidate(plan, last)).toBe(true)
  })

  test("arg-parser invalid status and json file input", async () => {
    expect(() =>
      parseRecordEvidenceArgs(["--goal-id", "g", "--criterion-id", "c", "--status", "weird", "--evidence", "e"]),
    ).toThrow(/pass, fail, or blocked/)
    const r = await root()
    const p = join(r, "j.json")
    await writeFile(p, '{"z":1}\n', "utf8")
    expect(await readJsonInput(p)).toEqual({ z: 1 })
    expect(readValue(["--x"], "--x")).toBeUndefined()
  })

  test("codex snapshot normalize statuses and reconcile warnings", async () => {
    expect(parseCodexGoalSnapshot({ goal: { objective: "o", status: "completed" } }).status).toBe("complete")
    expect(parseCodexGoalSnapshot({ goal: { objective: "o", status: "running" } }).status).toBe("active")
    expect(parseCodexGoalSnapshot({ goal: { objective: "o", status: "canceled" } }).status).toBe("cancelled")
    expect(parseCodexGoalSnapshot({ goal: { objective: "o", status: "failure" } }).status).toBe("failed")
    expect(parseCodexGoalSnapshot(false).available).toBe(false)
    const rec = reconcileCodexGoalSnapshot(parseCodexGoalSnapshot({ goal: { objective: "o", status: "active" } }), {
      expectedObjective: "o",
      allowedStatuses: ["complete"],
      requireComplete: true,
      requireSnapshot: true,
    })
    expect(rec.ok).toBe(false)
    expect(rec.errors.length).toBeGreaterThan(0)
  })

  test("ulwLoopCommand unknown without json prints help", async () => {
    const r = await capture(() => ulwLoopCommand(["totally-unknown"]))
    expect(r.code).toBe(1)
    expect(r.out + r.err).toMatch(/create-goals|Usage|Unknown/)
  })

  test("readSteeringLedgerEntries empty when missing", async () => {
    const r = await root()
    expect(await readSteeringLedgerEntries(r)).toEqual([])
  })

  test("isUlwLoopDone false when superseded unresolved", async () => {
    const r = await root()
    await createUlwLoopPlan(r, { brief: "- Only one\n" })
    const plan = await readUlwLoopPlan(r)
    const g = plan.goals[0]!
    await steerUlwLoop(r, {
      kind: "split_subgoal",
      source: "cli",
      targetGoalId: g.id,
      childGoals: [{ title: "Kid", objective: "kid work" }],
      evidence: "e",
      rationale: "r",
    })
    const after = await readUlwLoopPlan(r)
    // parent superseded, child pending → not done
    expect(isUlwLoopDone(after)).toBe(false)
  })
})
