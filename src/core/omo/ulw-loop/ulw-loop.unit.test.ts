import { describe, expect, test } from "vitest"
import {
  hasFlag,
  parseGoalArg,
  parseRecordEvidenceArgs,
  positionalText,
  readRepeated,
  readValue,
} from "./cli-arg-parser.js"
import {
  aggregateCodexObjective,
  aggregateCodexObjectiveForScope,
  codexGoalMode,
  essentialCriteriaOf,
  expectedCodexObjective,
  firstUnresolvedCriterion,
  hasAllCriteriaPass,
  hasEssentialCriteriaPass,
  isEssentialCriterion,
  isFinalRunCompletionCandidate,
  isUlwLoopDone,
} from "./goal-status.js"
import {
  normalizeUlwLoopSessionId,
  resolveUlwLoopSessionIdFromEnv,
  repoRelative,
  ulwLoopBriefPath,
  ulwLoopDir,
  ulwLoopGoalsPath,
  ulwLoopLedgerPath,
  ulwLoopRelativeDir,
} from "./paths.js"
import {
  appendGoalToPlan,
  deriveGoalCandidates,
  makeGoal,
  seedDefaultSuccessCriteria,
} from "./plan-goal-factory.js"
import { UlwLoopError, iso } from "./runtime.js"
import type { UlwLoopItem, UlwLoopPlan } from "./domain-types.js"
import { buildUltraworkDirectiveOutput } from "./ultrawork-directive.js"
import { normalizeCodexGoalMode, blockedDecisionHandoff } from "./cli-output.js"
import { parseCodexGoalSnapshot, reconcileCodexGoalSnapshot } from "./codex-goal-snapshot.js"
import { ULW_LOOP_SUBCOMMANDS, isUlwLoopSubcommand } from "./cli-commands.js"

function planWithGoals(goals: UlwLoopItem[], extra: Partial<UlwLoopPlan> = {}): UlwLoopPlan {
  return {
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    briefPath: ".omo/ulw-loop/brief.md",
    goalsPath: ".omo/ulw-loop/goals.json",
    ledgerPath: ".omo/ulw-loop/ledger.jsonl",
    codexGoalMode: "aggregate",
    goals,
    ...extra,
  }
}

describe("ulw-loop pure units (TDD)", () => {
  test("cli-arg-parser reads flags, values, and record-evidence args", () => {
    const argv = [
      "record-evidence",
      "--goal-id",
      "G001",
      "--criterion-id=C001",
      "--status",
      "pass",
      "--evidence",
      "stdout ok",
      "--notes",
      "n1",
      "--json",
    ]
    expect(hasFlag(argv, "--json")).toBe(true)
    expect(readValue(argv, "--goal-id")).toBe("G001")
    expect(readValue(argv, "--criterion-id")).toBe("C001")
    expect(readRepeated(["--x", "a", "--x=b"], "--x")).toEqual(["a", "b"])
    expect(parseGoalArg(argv)).toBe("G001")
    expect(positionalText(["create-goals", "hello", "world", "--force"])).toBe("hello world")
    const rec = parseRecordEvidenceArgs(argv)
    expect(rec).toMatchObject({ goalId: "G001", criterionId: "C001", status: "pass", evidence: "stdout ok", notes: "n1" })
    expect(() => parseRecordEvidenceArgs(["--goal-id", "G1"])).toThrow(UlwLoopError)
    expect(() => parseRecordEvidenceArgs(["--goal-id", "G1", "--criterion-id", "C1", "--status", "nope", "--evidence", "e"])).toThrow(
      /pass, fail, or blocked/,
    )
  })

  test("paths normalize session ids and resolve env", () => {
    expect(normalizeUlwLoopSessionId("  ")).toBeNull()
    expect(normalizeUlwLoopSessionId("../evil/sess")).toBe("evil-sess")
    expect(normalizeUlwLoopSessionId("abc/def")).toBe("abc-def")
    expect(resolveUlwLoopSessionIdFromEnv({ OMO_ULW_LOOP_SESSION_ID: "s1" })).toBe("s1")
    expect(resolveUlwLoopSessionIdFromEnv({ LFG_ULW_LOOP_SESSION_ID: "s2" })).toBe("s2")
    expect(resolveUlwLoopSessionIdFromEnv({})).toBeNull()
    expect(ulwLoopRelativeDir()).toBe(".omo/ulw-loop")
    expect(ulwLoopRelativeDir({ sessionId: "run-a" })).toBe(".omo/ulw-loop/run-a")
    expect(ulwLoopDir("/repo", { sessionId: "run-a" })).toContain("run-a")
    expect(ulwLoopBriefPath("/repo")).toContain("brief.md")
    expect(ulwLoopGoalsPath("/repo")).toContain("goals.json")
    expect(ulwLoopLedgerPath("/repo")).toContain("ledger.jsonl")
    expect(repoRelative("/repo/src/a.ts", "/repo")).toBe("src/a.ts")
  })

  test("plan-goal-factory derives goals and seeds criteria", () => {
    const bullets = deriveGoalCandidates("- First goal\n- Second goal\n")
    expect(bullets).toHaveLength(2)
    expect(bullets[0]?.title).toContain("First")
    const empty = deriveGoalCandidates("")
    expect(empty[0]?.objective).toContain("Complete the requested")
    const criteria = seedDefaultSuccessCriteria(0, "Ship it")
    expect(criteria.map((c) => c.id)).toEqual(["C001", "C002", "C003"])
    expect(criteria[0]?.essential).toBe(true)
    expect(criteria[2]?.essential).toBe(false)
    const goal = makeGoal("Title", "Objective text", 0, iso())
    expect(goal.id.startsWith("G001")).toBe(true)
    expect(goal.status).toBe("pending")
    expect(() => makeGoal("  ", "x", 0, iso())).toThrow(UlwLoopError)
    const plan = planWithGoals([goal])
    const added = appendGoalToPlan(plan, "Extra", "Do more", iso())
    expect(plan.goals).toHaveLength(2)
    expect(added.id.startsWith("G002")).toBe(true)
  })

  test("goal-status completion and criteria helpers", () => {
    const g1 = makeGoal("A", "obj-a", 0, iso())
    const g2 = makeGoal("B", "obj-b", 1, iso())
    const plan = planWithGoals([g1, g2], { codexGoalMode: "aggregate", codexObjective: "AGG" })
    expect(isUlwLoopDone(plan)).toBe(false)
    expect(codexGoalMode(plan)).toBe("aggregate")
    expect(expectedCodexObjective(plan, g1)).toBe("AGG")
    expect(aggregateCodexObjective(plan)).toBe("AGG")
    expect(aggregateCodexObjectiveForScope({ sessionId: "x" })).toContain(".omo/ulw-loop/x")
    g1.status = "complete"
    g2.status = "complete"
    expect(isUlwLoopDone(plan)).toBe(true)
    expect(isUlwLoopDone(planWithGoals([g1], { aggregateCompletion: { status: "complete", completedAt: iso(), evidence: "e" } }))).toBe(
      true,
    )

    for (const c of g1.successCriteria) c.status = "pass"
    expect(hasAllCriteriaPass(g1)).toBe(true)
    expect(hasEssentialCriteriaPass(g1)).toBe(true)
    expect(firstUnresolvedCriterion(g1)).toBeUndefined()
    g1.successCriteria[0]!.status = "pending"
    expect(hasAllCriteriaPass(g1)).toBe(false)
    expect(firstUnresolvedCriterion(g1)?.id).toBe("C001")
    expect(isEssentialCriterion(g1.successCriteria[0]!)).toBe(true)
    expect(essentialCriteriaOf(g1).length).toBeGreaterThan(0)

    const only = makeGoal("Only", "solo", 0, iso())
    const soloPlan = planWithGoals([only])
    expect(isFinalRunCompletionCandidate(soloPlan, only)).toBe(true)
  })

  test("cli-commands catalog and codex mode normalize", () => {
    expect(ULW_LOOP_SUBCOMMANDS).toContain("create-goals")
    expect(isUlwLoopSubcommand("status")).toBe(true)
    expect(isUlwLoopSubcommand("nope")).toBe(false)
    expect(normalizeCodexGoalMode(undefined)).toBe("aggregate")
    expect(normalizeCodexGoalMode("per_story")).toBe("per_story")
    expect(() => normalizeCodexGoalMode("x")).toThrow(UlwLoopError)
    expect(blockedDecisionHandoff(planWithGoals([makeGoal("A", "o", 0, iso())]))).toBe("")
  })

  test("codex goal snapshot parse + reconcile", () => {
    const snap = parseCodexGoalSnapshot({ goal: { objective: "Ship it", status: "complete" } })
    expect(snap.available).toBe(true)
    expect(snap.status).toBe("complete")
    const ok = reconcileCodexGoalSnapshot(snap, {
      expectedObjective: "Ship it",
      allowedStatuses: ["complete"],
      requireSnapshot: true,
      requireComplete: true,
    })
    expect(ok.ok).toBe(true)
    const bad = reconcileCodexGoalSnapshot(snap, {
      expectedObjective: "Other",
      allowedStatuses: ["complete"],
      requireSnapshot: true,
      requireComplete: true,
    })
    expect(bad.ok).toBe(false)
  })

  test("ultrawork directive injects only for ulw prompts", () => {
    expect(buildUltraworkDirectiveOutput({ prompt: "please /ulw fix tests" })).toContain("<ultrawork-mode>")
    expect(buildUltraworkDirectiveOutput({ prompt: "normal request" })).toBe("")
    expect(buildUltraworkDirectiveOutput({ prompt: "fix after context was compacted" })).toBe("")
  })

  test("UlwLoopError carries code and details", () => {
    const err = new UlwLoopError("msg", "CODE", { details: { a: 1 } })
    expect(err.code).toBe("CODE")
    expect(err.details).toEqual({ a: 1 })
    expect(iso()).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})
