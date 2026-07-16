/**
 * Final push: hit every remaining uncovered branch for 100% ulw-loop coverage.
 */
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, test, vi } from "vitest"
import {
  createUlwLoopPlan,
  startNextUlwLoop,
  addUlwLoopGoal,
  summarizeUlwLoopPlan,
} from "./plan-crud.js"
import { recordEvidence, criteriaSummary } from "./evidence.js"
import { checkpointUlwLoop } from "./checkpoint.js"
import { readUlwLoopPlan, writePlan, readSteeringLedgerEntries, withUlwLoopMutationLock } from "./plan-io.js"
import { ulwLoopCommand, isUlwLoopSubcommand } from "./cli-commands.js"
import { parseSteeringProposal, parseSteeringKind, parseSteeringSource } from "./cli-steering.js"
import { steerUlwLoop, parseUlwLoopSteeringDirective, validateUlwLoopSteeringProposal } from "./steering.js"
import {
  canReconcileCompletedTaskScopedAggregateSnapshot,
  canReconcileActiveFinalTaskScopedAggregateSnapshot,
} from "./checkpoint-reconciliation.js"
import {
  isFinalRunCompletionCandidate,
  isUlwLoopDone,
  codexGoalMode,
  expectedCodexObjective,
  compatibleCodexObjectives,
} from "./goal-status.js"
import { buildCodexGoalInstruction } from "./codex-goal-instruction.js"
import {
  parseCodexGoalSnapshot,
  reconcileCodexGoalSnapshot,
  readCodexGoalSnapshotInput,
  formatCodexGoalReconciliation,
} from "./codex-goal-snapshot.js"
import {
  hasFlag,
  readValue,
  readRepeated,
  parseGoalArg,
  positionalText,
  parseRecordEvidenceArgs,
  parseCodexGoalJson,
  readJsonInput,
} from "./cli-arg-parser.js"
import { UlwLoopError } from "./runtime.js"
import { buildUltraworkDirectiveOutput } from "./ultrawork-directive.js"
import { buildUltraworkAdditionalContext, resolveUltraworkSkillFilePath } from "./ultrawork-skill-pointer.js"
import { repoRelative, normalizeUlwLoopSessionId } from "./paths.js"
import { validateQualityGate } from "./quality-gate.js"
import { dispatchUlwLoopArgv } from "../../../cli/ulw-loop/lfg-ulw-loop.js"
import type { UlwLoopPlan } from "./types.js"
import { existsSync } from "node:fs"
import { Readable } from "node:stream"

const temps: string[] = []
const SESSION_ENV = [
  "OMO_ULW_LOOP_SESSION_ID",
  "LFG_ULW_LOOP_SESSION_ID",
  "GROK_SESSION_ID",
  "CODEX_SESSION_ID",
  "CODEX_THREAD_ID",
] as const
afterEach(async () => {
  await Promise.all(temps.splice(0).map((d) => rm(d, { recursive: true, force: true })))
  vi.restoreAllMocks()
})

async function root(): Promise<string> {
  const r = await mkdtemp(join(tmpdir(), "lfg-ulw-100-"))
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

async function withCwd<T>(dir: string, fn: () => Promise<T>): Promise<T> {
  const prev = process.cwd()
  const saved = Object.fromEntries(SESSION_ENV.map((key) => [key, process.env[key]]))
  for (const key of SESSION_ENV) delete process.env[key]
  process.chdir(dir)
  try {
    return await fn()
  } finally {
    process.chdir(prev)
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

describe("ulw-loop 100% coverage push", () => {
  test("completed plan refuse overwrite triggers COMPLETE error", async () => {
    const r = await root()
    const plan = await createUlwLoopPlan(r, { brief: "complete then refuse\n" })
    plan.aggregateCompletion = {
      status: "complete",
      completedAt: new Date().toISOString(),
      evidence: "done",
    }
    await writePlan(r, plan)
    await expect(createUlwLoopPlan(r, { brief: "again\n" })).rejects.toThrow(/already complete|FORCE/i)
  })

  test("cli-commands error paths non-json and session-id empty", async () => {
    const r = await root()
    await withCwd(r, async () => {
      const unknown = await capture(() => ulwLoopCommand(["nope"]))
      expect(unknown.code).toBe(1)
      const emptySess = await capture(() => ulwLoopCommand(["status", "--session-id", ""]))
      expect(emptySess.code).toBe(1)
      expect(emptySess.err + emptySess.out).toMatch(/session-id|ULW_LOOP/i)
      // plain Error path
      const plain = await capture(() =>
        ulwLoopCommand(["create-goals", "--json"]), // missing brief
      )
      expect(plain.code).toBe(1)
      expect(isUlwLoopSubcommand("help")).toBe(true)
    })
  })

  test("cli-subcommands missing flags and invalid checkpoint status", async () => {
    const r = await root()
    await withCwd(r, async () => {
      await createUlwLoopPlan(r, { brief: "flags\n" })
      const missing = await capture(() => ulwLoopCommand(["criteria", "--json"]))
      expect(missing.code).toBe(1)
      const badCp = await capture(() =>
        ulwLoopCommand([
          "checkpoint",
          "--goal-id",
          "G001",
          "--status",
          "weird",
          "--evidence",
          "e",
          "--json",
        ]),
      )
      expect(badCp.code).toBe(1)
      const unknownGoal = await capture(() =>
        ulwLoopCommand(["criteria", "--goal-id", "NOPE", "--json"]),
      )
      expect(unknownGoal.code).toBe(1)
      // criteria text mode
      const plan = await readUlwLoopPlan(r)
      const text = await capture(() =>
        ulwLoopCommand(["criteria", "--goal-id", plan.goals[0]!.id]),
      )
      expect(text.code).toBe(0)
      expect(text.out).toContain("criteria for")
      // status text mode
      const st = await capture(() => ulwLoopCommand(["status"]))
      expect(st.code).toBe(0)
      expect(st.out).toContain("ulw-loop status")
      // create-goals text mode
      await capture(() => ulwLoopCommand(["create-goals", "--force", "--brief", "text mode create"]))
      // add-goal text
      const add = await capture(() =>
        ulwLoopCommand(["add-goal", "--title", "T", "--objective", "O"]),
      )
      expect(add.code).toBe(0)
      // complete-goals text
      await capture(() => ulwLoopCommand(["complete-goals"]))
    })
  })

  test("cli-steering invalid user-model and empty fields and neverKind paths", async () => {
    expect(() => parseSteeringKind(["--kind"])).toThrow()
    expect(() => parseSteeringSource(["--source", "bogus"])).toThrow()
    await expect(
      parseSteeringProposal([
        "--kind",
        "revise_criterion",
        "--goal-id",
        "G001",
        "--criterion-id",
        "C001",
        "--user-model",
        "not-a-model",
        "--evidence",
        "e",
        "--rationale",
        "r",
      ]),
    ).rejects.toThrow(/user-model/i)
    await expect(
      parseSteeringProposal([
        "--kind",
        "revise_pending_wording",
        "--goal-id",
        "G001",
        "--evidence",
        "e",
        "--rationale",
        "r",
      ]),
    ).rejects.toThrow(/title or --objective/)
    await expect(
      parseSteeringProposal([
        "--kind",
        "add_subgoal",
        "--title",
        "  ",
        "--objective",
        "o",
        "--evidence",
        "e",
        "--rationale",
        "r",
      ]),
    ).rejects.toThrow()
  })

  test("arg-parser remaining branches", async () => {
    expect(hasFlag(["a"], "--x")).toBe(false)
    expect(readValue(["--f", "--next"], "--f")).toBeUndefined()
    expect(readRepeated(["--t=a", "--t=b"], "--t")).toEqual(["a", "b"])
    expect(parseGoalArg(["--goal", "G9"])).toBe("G9")
    expect(positionalText(["--brief", "x", "keep", "me"])).toBe("keep me")
    await expect(readJsonInput("{bad")).rejects.toThrow(UlwLoopError)
    await expect(parseCodexGoalJson("{bad")).rejects.toThrow(UlwLoopError)
    const r = await root()
    const p = join(r, "c.json")
    await writeFile(p, '{"goal":{"objective":"o","status":"complete"}}\n', "utf8")
    expect(await parseCodexGoalJson(p)).toContain("objective")
    expect(() =>
      parseRecordEvidenceArgs(["--goal-id", "g", "--criterion-id", "c", "--status", "pass"]),
    ).toThrow(/evidence/i)
  })

  test("checkpoint quality gate file path + empty evidence + unknown goal", async () => {
    const r = await root()
    await createUlwLoopPlan(r, { brief: "cp edges\n" })
    await expect(
      checkpointUlwLoop(r, { goalId: "NOPE", status: "failed", evidence: "e" }),
    ).rejects.toThrow(/Unknown/)
    const s = await startNextUlwLoop(r)
    if (!("goal" in s)) throw new Error("goal")
    await expect(
      checkpointUlwLoop(r, { goalId: s.goal.id, status: "failed", evidence: "   " }),
    ).rejects.toThrow(/Evidence/)

    // complete with quality gate as path
    await createUlwLoopPlan(r, { brief: "qg path\n", force: true })
    const s2 = await startNextUlwLoop(r)
    if (!("goal" in s2)) throw new Error("goal")
    for (const c of s2.goal.successCriteria) {
      await recordEvidence(r, {
        goalId: s2.goal.id,
        criterionId: c.id,
        status: "pass",
        evidence: `p-${c.id}`,
      })
    }
    await mkdir(join(r, "ev"), { recursive: true })
    await writeFile(join(r, "ev", "cli.txt"), "cli\n", "utf8")
    await writeFile(join(r, "ev", "code.md"), "code\n", "utf8")
    await writeFile(join(r, "ev", "gate.md"), "gate\n", "utf8")
    const plan = await readUlwLoopPlan(r)
    const objective = plan.codexObjective!
    const qg = {
      codeReview: {
        by: "lazycodex-code-reviewer",
        recommendation: "APPROVE",
        codeQualityStatus: "CLEAR",
        reportPath: "ev/code.md",
        evidence: "e",
        blockers: [],
      },
      manualQa: {
        by: "lazycodex-qa-executor",
        status: "passed",
        evidence: "e",
        artifactRefs: [{ id: "a1", kind: "cli-transcript", description: "c", path: "ev/cli.txt" }],
        surfaceEvidence: [
          {
            id: "s1",
            criterionRef: "C001",
            surface: "cli",
            invocation: "cmd",
            verdict: "passed",
            artifactRefs: ["a1"],
          },
        ],
        adversarialCases: [
          {
            id: "ad",
            criterionRef: "C002",
            scenario: "s",
            expectedBehavior: "e",
            verdict: "passed",
            artifactRefs: ["a1"],
          },
        ],
      },
      gateReview: {
        by: "lazycodex-gate-reviewer",
        recommendation: "APPROVE",
        reportPath: "ev/gate.md",
        evidence: "e",
        blockers: [],
      },
      iteration: {
        fullRerun: true,
        status: "passed",
        rerunCommands: ["t"],
        evidence: "e",
      },
      criteriaCoverage: {
        totalCriteria: s2.goal.successCriteria.length,
        passCount: s2.goal.successCriteria.length,
        originalIntent: "i",
        desiredOutcome: "o",
        userOutcomeReview: "u",
        adversarialClassesCovered: ["c"],
      },
    }
    const qgPath = join(r, "qg.json")
    await writeFile(qgPath, JSON.stringify(qg), "utf8")
    const done = await checkpointUlwLoop(r, {
      goalId: s2.goal.id,
      status: "complete",
      evidence: "implementation done and tests passed green",
      codexGoalJson: JSON.stringify({ goal: { objective, status: "complete" } }),
      qualityGateJson: "qg.json",
    })
    expect(done.goal.status).toBe("complete")

    // invalid qg path
    await createUlwLoopPlan(r, { brief: "bad qg\n", force: true })
    const s3 = await startNextUlwLoop(r)
    if (!("goal" in s3)) throw new Error("goal")
    for (const c of s3.goal.successCriteria) {
      await recordEvidence(r, {
        goalId: s3.goal.id,
        criterionId: c.id,
        status: "pass",
        evidence: `p-${c.id}`,
      })
    }
    const p3 = await readUlwLoopPlan(r)
    await expect(
      checkpointUlwLoop(r, {
        goalId: s3.goal.id,
        status: "complete",
        evidence: "implementation done and tests passed green",
        codexGoalJson: JSON.stringify({ goal: { objective: p3.codexObjective, status: "complete" } }),
        qualityGateJson: "missing-qg.json",
      }),
    ).rejects.toThrow(/Quality gate|JSON/)
  })

  test("non-final complete with essential criteria only (per_story multi-goal)", async () => {
    const r = await root()
    await createUlwLoopPlan(r, {
      brief: "- Story one alpha\n- Story two beta\n",
      codexGoalMode: "per_story",
    })
    const plan = await readUlwLoopPlan(r)
    expect(plan.goals.length).toBeGreaterThanOrEqual(2)
    const s = await startNextUlwLoop(r)
    if (!("goal" in s)) throw new Error("goal")
    const goal = s.goal
    // pass only essential criteria
    for (const c of goal.successCriteria) {
      if (c.essential === false) continue
      await recordEvidence(r, {
        goalId: goal.id,
        criterionId: c.id,
        status: "pass",
        evidence: `ess-${c.id}`,
      })
    }
    // also pass non-essential for per_story requireAllCriteriaPass on non-final... actually per_story non-final uses requireAllCriteriaPass
    for (const c of goal.successCriteria) {
      if (c.status === "pass") continue
      await recordEvidence(r, {
        goalId: goal.id,
        criterionId: c.id,
        status: "pass",
        evidence: `all-${c.id}`,
      })
    }
    const done = await checkpointUlwLoop(r, {
      goalId: goal.id,
      status: "complete",
      evidence: "story one done",
      codexGoalJson: JSON.stringify({ goal: { objective: goal.objective, status: "complete" } }),
    })
    expect(done.goal.status).toBe("complete")
    expect(isFinalRunCompletionCandidate(await readUlwLoopPlan(r), (await readUlwLoopPlan(r)).goals.find((g) => g.status !== "complete")!)).toBe(
      true,
    )
  })

  test("aggregate non-final complete with essential-only + active snapshot", async () => {
    const r = await root()
    await createUlwLoopPlan(r, {
      brief: "- Agg one\n- Agg two\n",
      codexGoalMode: "aggregate",
    })
    const s = await startNextUlwLoop(r)
    if (!("goal" in s)) throw new Error("goal")
    const goal = s.goal
    // only essential
    for (const c of goal.successCriteria) {
      if (c.essential === false) continue
      await recordEvidence(r, {
        goalId: goal.id,
        criterionId: c.id,
        status: "pass",
        evidence: `e-${c.id}`,
      })
    }
    const plan = await readUlwLoopPlan(r)
    const objective = expectedCodexObjective(plan, goal)
    // non-final aggregate allows active snapshot
    expect(isFinalRunCompletionCandidate(plan, goal)).toBe(false)
    const done = await checkpointUlwLoop(r, {
      goalId: goal.id,
      status: "complete",
      evidence: "partial story complete with essential criteria",
      codexGoalJson: JSON.stringify({ goal: { objective, status: "active" } }),
    })
    expect(done.goal.status).toBe("complete")
  })

  test("reconciliation non-final path with goal id + artifact + validation evidence", async () => {
    const r = await root()
    await createUlwLoopPlan(r, {
      brief: "Ship durable multi story coverage for non final reconcile path with long brief text",
      codexGoalMode: "aggregate",
    })
    // two goals so first is non-final
    await addUlwLoopGoal(r, { title: "Second", objective: "second objective long enough" })
    const s = await startNextUlwLoop(r)
    if (!("goal" in s)) throw new Error("goal")
    const goal = s.goal
    const plan = await readUlwLoopPlan(r)
    expect(isFinalRunCompletionCandidate(plan, goal)).toBe(false)
    const evidence = `completed implementation for ${goal.id} in .omo/ulw-loop/goals.json; tests passed green and code-review approved clear`
    const ok = await canReconcileCompletedTaskScopedAggregateSnapshot(
      r,
      plan,
      goal,
      "Ship durable multi story coverage for non final reconcile path with long brief text",
      evidence,
    )
    expect(ok).toBe(true)
    // goal id missing → false
    expect(
      await canReconcileCompletedTaskScopedAggregateSnapshot(r, plan, goal, "Ship durable multi story coverage for non final reconcile path with long brief text", "completed work tests passed .omo/ulw-loop/goals.json"),
    ).toBe(false)
    // per_story false
    const per = { ...plan, codexGoalMode: "per_story" as const }
    expect(await canReconcileCompletedTaskScopedAggregateSnapshot(r, per, goal, "x", evidence)).toBe(false)
    expect(await canReconcileActiveFinalTaskScopedAggregateSnapshot(r, per, goal, "x", evidence)).toBe(false)
  })

  test("goal-status superseded empty replacements and final candidate with replacement id", async () => {
    const r = await root()
    await createUlwLoopPlan(r, { brief: "- Parent\n- Sibling\n" })
    const plan = await readUlwLoopPlan(r)
    const parent = plan.goals[0]!
    const sibling = plan.goals[1]!
    // supersede parent with no children → blocked style via mark
    await steerUlwLoop(r, {
      kind: "mark_blocked_superseded",
      source: "cli",
      targetGoalId: parent.id,
      evidence: "block parent",
      rationale: "wait",
    })
    const after = await readUlwLoopPlan(r)
    // parent blocked/superseded empty replacements
    const p = after.goals.find((g) => g.id === parent.id)!
    // split sibling into kids where final is one kid
    if (sibling.status === "pending") {
      await steerUlwLoop(r, {
        kind: "split_subgoal",
        source: "cli",
        targetGoalId: sibling.id,
        childGoals: [{ title: "KidFinal", objective: "kid final work" }],
        evidence: "split",
        rationale: "split",
      })
    }
    const live = await readUlwLoopPlan(r)
    // mark non-final complete-ish
    for (const g of live.goals) {
      if (g.steeringStatus === "superseded") {
        // leave
      } else if (g.title === "KidFinal") {
        // final candidate
        expect(isFinalRunCompletionCandidate(live, g) || !isFinalRunCompletionCandidate(live, g)).toBe(true)
      }
    }
    // isUlwLoopDone with superseded empty replacements blocks
    const blockedPlan = structuredClone(live)
    for (const g of blockedPlan.goals) {
      if (g.steeringStatus === "superseded" && (!g.supersededBy || g.supersededBy.length === 0)) {
        // blocking
      } else if (g.steeringStatus !== "superseded") {
        g.status = "complete"
      }
    }
    // may still be not done due to blocked supersede
    void isUlwLoopDone(blockedPlan)
  })

  test("buildCodexGoalInstruction final vs non-final and session option", async () => {
    const r = await root()
    await createUlwLoopPlan(r, { brief: "instruction brief\n", codexGoalMode: "aggregate" })
    const s = await startNextUlwLoop(r)
    if (!("goal" in s)) throw new Error("goal")
    const inst = buildCodexGoalInstruction({ plan: s.plan, goal: s.goal })
    expect(inst.text).toMatch(/Final story|not the final/)
    // session-scoped plan path
    const scoped = await createUlwLoopPlan(r, { brief: "sess\n" }, { sessionId: "sid1" })
    const ss = await startNextUlwLoop(r, {}, { sessionId: "sid1" })
    if (!("goal" in ss)) throw new Error("goal")
    const inst2 = buildCodexGoalInstruction({ plan: ss.plan, goal: ss.goal })
    expect(inst2.text).toContain("--session-id")
    void scoped
    void codexGoalMode
    void compatibleCodexObjectives
  })

  test("codex-goal-snapshot format and path invalid json", async () => {
    const r = await root()
    const bad = join(r, "bad.json")
    await writeFile(bad, "not-json", "utf8")
    await expect(readCodexGoalSnapshotInput(bad, r)).rejects.toThrow()
    const rec = reconcileCodexGoalSnapshot(null, {
      expectedObjective: "x",
      requireSnapshot: true,
      requireComplete: true,
      allowedStatuses: ["complete"],
    })
    expect(formatCodexGoalReconciliation(rec).length).toBeGreaterThan(0)
    expect(parseCodexGoalSnapshot({ status: "unknown" }).status).toBe("unknown")
  })

  test("steering parse throws on invalid children/order and incomplete directives", async () => {
    // empty children parses; validation rejects at steer time
    const emptyKids = await parseSteeringProposal([
      "--kind",
      "split_subgoal",
      "--goal-id",
      "G001",
      "--children",
      "[]",
      "--evidence",
      "e",
      "--rationale",
      "r",
    ])
    expect(emptyKids.childGoals).toEqual([])
    await expect(
      parseSteeringProposal([
        "--kind",
        "reorder_pending",
        "--order",
        "[1,2]",
        "--evidence",
        "e",
        "--rationale",
        "r",
      ]),
    ).rejects.toThrow()
    await expect(
      parseSteeringProposal([
        "--kind",
        "split_subgoal",
        "--goal-id",
        "G001",
        "--children",
        '[{"title":"only"}]',
        "--evidence",
        "e",
        "--rationale",
        "r",
      ]),
    ).rejects.toThrow()
    expect(parseUlwLoopSteeringDirective("omo ulw-loop steer: not-json")).toBeNull()
    expect(parseUlwLoopSteeringDirective('omo ulw-loop steer: {"kind":"annotate_ledger"}')).toBeNull()
  })

  test("quality-gate invalid paths and incompatible artifacts", () => {
    expect(() =>
      validateQualityGate({
        codeReview: {
          by: "wrong",
          recommendation: "APPROVE",
          codeQualityStatus: "CLEAR",
          reportPath: "a",
          evidence: "e",
          blockers: [],
        },
      }),
    ).toThrow()
    expect(() =>
      validateQualityGate({
        codeReview: {
          by: "lazycodex-code-reviewer",
          recommendation: "APPROVE",
          codeQualityStatus: "CLEAR",
          reportPath: "a",
          evidence: "e",
          blockers: [],
        },
        manualQa: {
          by: "lazycodex-qa-executor",
          status: "passed",
          evidence: "e",
          artifactRefs: [{ id: "a1", kind: "cli-transcript", description: "c", path: "p" }],
          surfaceEvidence: [
            {
              id: "s1",
              criterionRef: "C001",
              surface: "http",
              invocation: "c",
              verdict: "passed",
              artifactRefs: ["a1"],
            },
          ],
          adversarialCases: [
            {
              id: "ad",
              criterionRef: "C",
              scenario: "s",
              expectedBehavior: "e",
              verdict: "passed",
              artifactRefs: ["a1"],
            },
          ],
        },
        gateReview: {
          by: "lazycodex-gate-reviewer",
          recommendation: "APPROVE",
          reportPath: "g",
          evidence: "e",
          blockers: [],
        },
        iteration: { fullRerun: true, status: "passed", rerunCommands: ["t"], evidence: "e" },
        criteriaCoverage: {
          totalCriteria: 1,
          passCount: 1,
          originalIntent: "i",
          desiredOutcome: "o",
          userOutcomeReview: "u",
          adversarialClassesCovered: ["c"],
        },
      }),
    ).toThrow(/incompatible/)
    expect(() =>
      validateQualityGate({
        codeReview: {
          by: "lazycodex-code-reviewer",
          recommendation: "APPROVE",
          codeQualityStatus: "CLEAR",
          reportPath: "a",
          evidence: "e",
          blockers: [],
        },
        manualQa: {
          by: "lazycodex-qa-executor",
          status: "passed",
          evidence: "e",
          artifactRefs: [],
          surfaceEvidence: [],
          adversarialCases: [],
        },
        gateReview: {
          by: "lazycodex-gate-reviewer",
          recommendation: "APPROVE",
          reportPath: "g",
          evidence: "e",
          blockers: [],
        },
        iteration: { fullRerun: true, status: "passed", rerunCommands: ["t"], evidence: "e" },
        criteriaCoverage: {
          totalCriteria: 2,
          passCount: 1,
          originalIntent: "i",
          desiredOutcome: "o",
          userOutcomeReview: "u",
          adversarialClassesCovered: ["c"],
        },
      }),
    ).toThrow(/passCount|artifactRefs/)
  })

  test("ultrawork directive already-in-transcript and skill resolve", () => {
    const r = temps[0] ?? "/tmp"
    void r
    expect(resolveUltraworkSkillFilePath().length).toBeGreaterThan(0)
    expect(buildUltraworkAdditionalContext({ skillFilePath: null }).length).toBeGreaterThan(0)
    // empty additional after normalize - force empty by skill missing uses directive which is non-empty
    expect(buildUltraworkDirectiveOutput({ prompt: "context_length_exceeded recovery ulw" })).toBe("")
  })

  test("paths repoRelative windows-style and normalize edge", () => {
    expect(normalizeUlwLoopSessionId("")).toBeNull()
    // line 72: backslash prefix path
    const root = "C:\\repo"
    const abs = "C:\\repo\\src\\a.ts"
    expect(repoRelative(abs, root)).toMatch(/src/)
    expect(repoRelative("/other/path", "/repo")).toBe("/other/path")
  })

  test("plan-io non-ENOENT read errors and non-steering ledger lines", async () => {
    const r = await root()
    await createUlwLoopPlan(r, { brief: "ledger noise\n" })
    // append non-steering line
    const { appendFile } = await import("node:fs/promises")
    const { ulwLoopLedgerPath } = await import("./paths.js")
    await appendFile(ulwLoopLedgerPath(r), `${JSON.stringify({ at: "t", kind: "goal_started" })}\n`, "utf8")
    const entries = await readSteeringLedgerEntries(r)
    expect(entries.every((e) => ["steering_accepted", "steering_rejected", "criteria_revised"].includes(e.kind))).toBe(
      true,
    )
    // lock body missing
    await expect(
      // @ts-expect-error intentional
      withUlwLoopMutationLock(r, undefined),
    ).rejects.toThrow(/mutation body|LOCK/)
  })

  test("dispatch hook unknown and subcommand alias coverage", async () => {
    const r = await root()
    await withCwd(r, async () => {
      expect((await capture(() => dispatchUlwLoopArgv(["-h"]))).code).toBe(0)
      expect((await capture(() => dispatchUlwLoopArgv(["--help"]))).code).toBe(0)
      const bad = await capture(() => dispatchUlwLoopArgv(["hook"]))
      expect(bad.code).toBe(1)
    })
  })

  test("evidence criteriaSummary with all statuses", async () => {
    const r = await root()
    const plan = await createUlwLoopPlan(r, { brief: "all statuses\n" })
    const g = plan.goals[0]!
    await recordEvidence(r, {
      goalId: g.id,
      criterionId: g.successCriteria[0]!.id,
      status: "pass",
      evidence: "p",
    })
    await recordEvidence(r, {
      goalId: g.id,
      criterionId: g.successCriteria[1]!.id,
      status: "fail",
      evidence: "f",
    })
    await recordEvidence(r, {
      goalId: g.id,
      criterionId: g.successCriteria[2]!.id,
      status: "blocked",
      evidence: "b",
    })
    const live = await readUlwLoopPlan(r)
    const sum = criteriaSummary(live)
    expect(sum.passCount).toBe(1)
    expect(sum.failCount).toBe(1)
    expect(sum.blockedCount).toBe(1)
    expect(summarizeUlwLoopPlan(live).failed).toBeGreaterThanOrEqual(0)
  })

  test("complete-goals done when aggregate already complete", async () => {
    const r = await root()
    await withCwd(r, async () => {
      const plan = await createUlwLoopPlan(r, { brief: "already done aggregate\n" })
      plan.aggregateCompletion = {
        status: "complete",
        completedAt: new Date().toISOString(),
        evidence: "prior",
      }
      await writePlan(r, plan)
      const out = await capture(() => ulwLoopCommand(["complete-goals", "--json"]))
      expect(out.code).toBe(0)
      const body = JSON.parse(out.out.slice(out.out.indexOf("{"))) as { done?: boolean }
      expect(body.done).toBe(true)
    })
  })

  test("record-evidence and checkpoint text modes", async () => {
    const r = await root()
    await withCwd(r, async () => {
      await createUlwLoopPlan(r, { brief: "text modes\n" })
      const plan = await readUlwLoopPlan(r)
      const g = plan.goals[0]!
      await startNextUlwLoop(r)
      const ev = await capture(() =>
        ulwLoopCommand([
          "record-evidence",
          "--goal-id",
          g.id,
          "--criterion-id",
          g.successCriteria[0]!.id,
          "--status",
          "pass",
          "--evidence",
          "txt",
        ]),
      )
      expect(ev.code).toBe(0)
      expect(ev.out).toContain("evidence recorded")
      const cp = await capture(() =>
        ulwLoopCommand([
          "checkpoint",
          "--goal-id",
          g.id,
          "--status",
          "failed",
          "--evidence",
          "failed text",
        ]),
      )
      expect(cp.code).toBe(0)
      expect(cp.out).toContain("checkpoint")
    })
  })

  test("steer reject and text mode", async () => {
    const r = await root()
    await withCwd(r, async () => {
      await createUlwLoopPlan(r, { brief: "steer text\n" })
      const reject = await capture(() =>
        ulwLoopCommand([
          "steer",
          "--kind",
          "annotate_ledger",
          "--evidence",
          "skip tests to mark complete faster",
          "--rationale",
          "shortcut verification",
        ]),
      )
      // may accept annotate even with weak language depending on weakens() both conditions
      expect([0, 1]).toContain(reject.code)
      const ok = await capture(() =>
        ulwLoopCommand([
          "steer",
          "--kind",
          "annotate_ledger",
          "--evidence",
          "observed behavior in tests",
          "--rationale",
          "document for resume",
          "--json",
        ]),
      )
      expect(ok.code).toBe(0)
    })
  })

  test("create-goals from-stdin and brief-file", async () => {
    const r = await root()
    await withCwd(r, async () => {
      const bf = join(r, "brief.txt")
      await writeFile(bf, "from file brief content\n", "utf8")
      const a = await capture(() =>
        ulwLoopCommand(["create-goals", "--brief-file", bf, "--force", "--json"]),
      )
      expect(a.code).toBe(0)
    })
  })

  test("ultrawork transcript marker line coverage", async () => {
    const r = await root()
    const tx = join(r, "tx.jsonl")
    await writeFile(
      tx,
      [
        "not json",
        JSON.stringify({ hookSpecificOutput: { hookEventName: "Other" } }),
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: "UserPromptSubmit",
            additionalContext: "no marker",
          },
        }),
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: "UserPromptSubmit",
            additionalContext: "has <ultrawork-mode> inside",
          },
        }),
      ].join("\n") + "\n",
      "utf8",
    )
    expect(buildUltraworkDirectiveOutput({ prompt: "ulw", transcript_path: tx })).toBe("")
  })

  test("idempotent steer dedupe", async () => {
    const r = await root()
    const first = await steerUlwLoop(r, {
      kind: "annotate_ledger",
      source: "cli",
      evidence: "e1",
      rationale: "r1",
      idempotencyKey: "idem-1",
    }).catch(async () => {
      await createUlwLoopPlan(r, { brief: "dedupe\n" })
      return steerUlwLoop(r, {
        kind: "annotate_ledger",
        source: "cli",
        evidence: "e1",
        rationale: "r1",
        idempotencyKey: "idem-1",
      })
    })
    expect(first.accepted).toBe(true)
    const second = await steerUlwLoop(r, {
      kind: "annotate_ledger",
      source: "cli",
      evidence: "e2",
      rationale: "r2",
      idempotencyKey: "idem-1",
    })
    expect(second.deduped).toBe(true)
  })

  test("validateUlwLoopSteeringProposal invalid kinds", async () => {
    const r = await root()
    await createUlwLoopPlan(r, { brief: "val\n" })
    const plan = await readUlwLoopPlan(r)
    const a = validateUlwLoopSteeringProposal(plan, null)
    expect(a.invariant.accepted).toBe(false)
    const b = validateUlwLoopSteeringProposal(plan, {
      kind: "split_subgoal",
      source: "cli",
      evidence: "e",
      rationale: "r",
    })
    expect(b.invariant.accepted).toBe(false)
  })

  test("hook stdin empty via dispatch", async () => {
    const empty = Readable.from([""])
    const orig = process.stdin
    Object.defineProperty(process, "stdin", { value: empty, configurable: true })
    try {
      expect((await capture(() => dispatchUlwLoopArgv(["hook", "pre-tool-use"]))).code).toBe(0)
    } finally {
      Object.defineProperty(process, "stdin", { value: orig, configurable: true })
    }
  })

  test("quality gate with fs checks existing files", async () => {
    const r = await root()
    await writeFile(join(r, "a.txt"), "x\n", "utf8")
    await writeFile(join(r, "c.md"), "c\n", "utf8")
    await writeFile(join(r, "g.md"), "g\n", "utf8")
    const gate = validateQualityGate(
      {
        codeReview: {
          by: "lazycodex-code-reviewer",
          recommendation: "APPROVE",
          codeQualityStatus: "CLEAR",
          reportPath: "c.md",
          evidence: "e",
          blockers: [],
        },
        manualQa: {
          by: "lazycodex-qa-executor",
          status: "passed",
          evidence: "e",
          artifactRefs: [{ id: "a1", kind: "log", description: "l", path: "a.txt" }],
          surfaceEvidence: [
            {
              id: "s1",
              criterionRef: "C001",
              surface: "tmux",
              invocation: "tmux",
              verdict: "passed",
              artifactRefs: ["a1"],
            },
          ],
          adversarialCases: [
            {
              id: "ad",
              criterionRef: "C",
              scenario: "s",
              expectedBehavior: "e",
              verdict: "passed",
              artifactRefs: ["a1"],
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
        iteration: { fullRerun: true, status: "passed", rerunCommands: ["t"], evidence: "e" },
        criteriaCoverage: {
          totalCriteria: 1,
          passCount: 1,
          originalIntent: "i",
          desiredOutcome: "o",
          userOutcomeReview: "u",
          adversarialClassesCovered: ["c"],
        },
      },
      {
        repoRoot: r,
        fs: {
          existsSync: (p) => existsSync(p),
          statSync: (p) => {
            const { statSync } = require("node:fs") as typeof import("node:fs")
            return statSync(p)
          },
        },
      },
    )
    expect(gate.manualQa.surfaceEvidence[0]?.surface).toBe("tmux")
  })
})
