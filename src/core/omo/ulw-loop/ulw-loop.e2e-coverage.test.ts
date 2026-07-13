/**
 * Evidence-proved e2e + unit gap-fill for ulw-loop → ratchet coverage toward 100%.
 * Every test leaves observable assertions (CLI exit, filesystem state, pure outputs).
 */
import { Readable } from "node:stream"
import { existsSync } from "node:fs"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, test } from "vitest"
import { dispatchUlwLoopArgv } from "../../../cli/ulw-loop/lfg-ulw-loop.js"
import {
  canReconcileActiveFinalTaskScopedAggregateSnapshot,
  canReconcileCompletedTaskScopedAggregateSnapshot,
  buildTaskScopedAggregateReconciliationHint,
} from "./checkpoint-reconciliation.js"
import {
  classifyExternalAuthorizationBlocker,
  clearGoalBlockerFields,
  normalizeBlockerEvidence,
  sameBlockerOccurrences,
} from "./quality-gate-blockers.js"
import {
  criteriaSummary,
  markCriteriaPendingResetForGoal,
  recordEvidence,
  requireAllCriteriaPass,
  requireAllPlanCriteriaPass,
  requireEssentialCriteriaPass,
  unresolvedCriteriaOf,
  unresolvedEssentialCriteriaOf,
} from "./evidence.js"
import {
  applySteeringMutation,
  parseUlwLoopSteeringDirective,
  steerUlwLoop,
  validateUlwLoopSteeringProposal,
} from "./steering.js"
import { createUlwLoopPlan, startNextUlwLoop } from "./plan-crud.js"
import { appendLedger, readSteeringLedgerEntries, readUlwLoopPlan, withUlwLoopMutationLock, writePlan } from "./plan-io.js"
import { buildUltraworkDirectiveOutput } from "./ultrawork-directive.js"
import { buildUltraworkAdditionalContext, buildUltraworkSkillPointer } from "./ultrawork-skill-pointer.js"
import { essentialCriteriaOf, isFinalRunCompletionCandidate, isUlwLoopDone } from "./goal-status.js"
import { UlwLoopError } from "./runtime.js"
import type { UlwLoopItem, UlwLoopPlan, UlwLoopSteeringProposal } from "./types.js"
import { parseSteeringProposal, printSteerResult } from "./cli-steering.js"
import { recordFinalReviewBlockers } from "./review-blockers.js"
import { normalizeUlwLoopSessionId, repoRelative, resolveUlwLoopSessionIdFromEnv } from "./paths.js"

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
})

async function temp(): Promise<string> {
  const r = await mkdtemp(join(tmpdir(), "lfg-ulw-e2e-"))
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

function parseJson(out: string): unknown {
  const i = out.indexOf("{")
  if (i < 0) throw new Error(`no json in: ${out.slice(0, 200)}`)
  return JSON.parse(out.slice(i))
}

async function withCwd<T>(root: string, fn: () => Promise<T>): Promise<T> {
  const prev = process.cwd()
  const saved = Object.fromEntries(SESSION_ENV.map((k) => [k, process.env[k]]))
  for (const k of SESSION_ENV) delete process.env[k]
  process.chdir(root)
  try {
    return await fn()
  } finally {
    process.chdir(prev)
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  }
}

describe("ulw-loop e2e coverage ratchet (evidence-proved)", () => {
  test("e2e: full CLI create→work→evidence→complete with quality gate writes durable state", async () => {
    const root = await temp()
    await withCwd(root, async () => {
      const created = await capture(() =>
        dispatchUlwLoopArgv([
          "ulw-loop",
          "create-goals",
          "--brief",
          "Prove coverage with durable evidence",
          "--json",
        ]),
      )
      expect(created.code).toBe(0)
      const plan0 = (parseJson(created.out) as { plan: UlwLoopPlan }).plan
      const goalId = plan0.goals[0]!.id
      expect(existsSync(join(root, ".omo", "ulw-loop", "goals.json"))).toBe(true)
      expect(existsSync(join(root, ".omo", "ulw-loop", "brief.md"))).toBe(true)
      expect(existsSync(join(root, ".omo", "ulw-loop", "ledger.jsonl"))).toBe(true)

      const started = await capture(() => dispatchUlwLoopArgv(["ulw-loop", "complete-goals", "--json"]))
      expect(started.code).toBe(0)
      expect((parseJson(started.out) as { goal: { status: string } }).goal.status).toBe("in_progress")

      for (const c of plan0.goals[0]!.successCriteria) {
        const ev = await capture(() =>
          dispatchUlwLoopArgv([
            "ulw-loop",
            "record-evidence",
            "--goal-id",
            goalId,
            "--criterion-id",
            c.id,
            "--status",
            "pass",
            "--evidence",
            `npm run coverage:ulw-loop green for ${c.id}`,
            "--json",
          ]),
        )
        expect(ev.code).toBe(0)
      }

      await mkdir(join(root, ".omo", "ulw-loop", "evidence"), { recursive: true })
      await writeFile(join(root, ".omo", "ulw-loop", "evidence", "cli.txt"), "coverage run ok\n", "utf8")
      await writeFile(join(root, ".omo", "ulw-loop", "evidence", "code.md"), "CLEAR\n", "utf8")
      await writeFile(join(root, ".omo", "ulw-loop", "evidence", "gate.md"), "APPROVE\n", "utf8")

      const objective = plan0.codexObjective!
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
              invocation: "npm run coverage:ulw-loop",
              verdict: "passed",
              artifactRefs: ["a1"],
            },
          ],
          adversarialCases: [
            {
              id: "adv1",
              criterionRef: "C002",
              scenario: "empty brief",
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
          rerunCommands: ["npm run coverage:ulw-loop"],
          evidence: "rerun green",
        },
        criteriaCoverage: {
          totalCriteria: plan0.goals[0]!.successCriteria.length,
          passCount: plan0.goals[0]!.successCriteria.length,
          originalIntent: "coverage 100",
          desiredOutcome: "100%",
          userOutcomeReview: "accepted",
          adversarialClassesCovered: ["empty"],
        },
      }

      const done = await capture(() =>
        dispatchUlwLoopArgv([
          "ulw-loop",
          "checkpoint",
          "--goal-id",
          goalId,
          "--status",
          "complete",
          "--evidence",
          "implementation done and tests passed green via npm run coverage:ulw-loop; quality gate clear",
          "--codex-goal-json",
          JSON.stringify({ goal: { objective, status: "complete" } }),
          "--quality-gate-json",
          JSON.stringify(qualityGate),
          "--json",
        ]),
      )
      expect(done.code).toBe(0)
      const body = parseJson(done.out) as {
        ok: boolean
        goal: { status: string }
        plan: { aggregateCompletion?: { status: string } }
      }
      expect(body.ok).toBe(true)
      expect(body.goal.status).toBe("complete")
      expect(body.plan.aggregateCompletion?.status).toBe("complete")
      const ledger = await readFile(join(root, ".omo", "ulw-loop", "ledger.jsonl"), "utf8")
      expect(ledger).toContain("plan_created")
      expect(ledger).toMatch(/goal_started|evidence/)
    })
  })

  test("hook e2e: dispatchUlwLoopArgv pre-tool-use and user-prompt-submit via stdin", async () => {
    const prePayload = JSON.stringify({
      hook_event_name: "PreToolUse",
      cwd: "/tmp",
      model: "m",
      permission_mode: "default",
      session_id: "s",
      tool_name: "create_goal",
      tool_use_id: "t",
      transcript_path: null,
      turn_id: "u",
      tool_input: { objective: "x", token_budget: 9 },
    })
    const preIn = Readable.from([prePayload])
    const origIn = process.stdin
    Object.defineProperty(process, "stdin", { value: preIn, configurable: true })
    const pre = await capture(() => dispatchUlwLoopArgv(["hook", "pre-tool-use"]))
    Object.defineProperty(process, "stdin", { value: origIn, configurable: true })
    expect(pre.code).toBe(0)
    expect(pre.out).toContain("deny")

    const upPayload = JSON.stringify({
      hook_event_name: "UserPromptSubmit",
      cwd: process.cwd(),
      prompt: "please ulw this",
      session_id: "s2",
    })
    const upIn = Readable.from([upPayload])
    Object.defineProperty(process, "stdin", { value: upIn, configurable: true })
    const up = await capture(() => dispatchUlwLoopArgv(["hook", "user-prompt-submit", "--with-ultrawork"]))
    Object.defineProperty(process, "stdin", { value: origIn, configurable: true })
    expect(up.code).toBe(0)
    expect(up.out).toContain("<ultrawork-mode>")
  })

  test("plan-io: missing plan, invalid plan, steering ledger, mutation lock, legacy objective migrate", async () => {
    const r = await temp()
    await expect(readUlwLoopPlan(r)).rejects.toThrow(/No ulw-loop plan/)
    await mkdir(join(r, ".omo", "ulw-loop"), { recursive: true })
    await writeFile(join(r, ".omo", "ulw-loop", "goals.json"), '{"version":2,"goals":[]}\n', "utf8")
    await expect(readUlwLoopPlan(r)).rejects.toThrow(/Invalid/)

    const plan = await createUlwLoopPlan(r, {
      brief: "legacy migrate\n",
      force: true,
      codexGoalMode: "aggregate",
    })
    plan.codexObjective = `Complete all ulw-loop stories listed in .omo/ulw-loop/goals.json. Use .omo/ulw-loop/ledger.jsonl as the durable audit trail.`
    await writePlan(r, plan)
    const migrated = await readUlwLoopPlan(r)
    expect(migrated.codexObjectiveAliases?.length ?? 0).toBeGreaterThan(0)

    await appendLedger(r, {
      at: new Date().toISOString(),
      kind: "steering_accepted",
      evidence: "e",
      message: "m",
      steering: {
        kind: "annotate_ledger",
        source: "cli",
        targetGoalIds: [],
        evidence: "e",
        rationale: "r",
        invariant: {
          accepted: true,
          structuralInvariantAccepted: true,
          evidenceBackedNecessity: true,
          noEasierCompletion: true,
          rejectedReasons: [],
          reasons: [],
        },
      },
    })
    const steering = await readSteeringLedgerEntries(r)
    expect(steering.length).toBeGreaterThan(0)

    const a = withUlwLoopMutationLock(r, async () => {
      await new Promise((res) => setTimeout(res, 5))
      return 1
    })
    const b = withUlwLoopMutationLock(r, async () => 2)
    expect(await Promise.all([a, b])).toEqual([1, 2])
    expect(repoRelative(join(r, "x"), r)).toContain("x")
  })

  test("evidence helpers: reset, summary, require* throw", async () => {
    const r = await temp()
    const plan = await createUlwLoopPlan(r, { brief: "evidence helpers\n" })
    const goal = plan.goals[0]!
    await recordEvidence(r, {
      goalId: goal.id,
      criterionId: goal.successCriteria[0]!.id,
      status: "pass",
      evidence: "p",
    })
    const reset = await markCriteriaPendingResetForGoal(r, goal.id)
    expect(reset.resetCount).toBe(goal.successCriteria.length)
    const reloaded = await readUlwLoopPlan(r)
    const summary = criteriaSummary(reloaded)
    expect(summary.pendingCount).toBe(summary.totalCriteria)
    expect(unresolvedCriteriaOf(reloaded.goals[0]!).length).toBeGreaterThan(0)
    expect(unresolvedEssentialCriteriaOf(reloaded.goals[0]!).length).toBeGreaterThan(0)
    expect(() => requireAllCriteriaPass(reloaded.goals[0]!)).toThrow(UlwLoopError)
    expect(() => requireEssentialCriteriaPass(reloaded.goals[0]!)).toThrow(UlwLoopError)
    expect(() => requireAllPlanCriteriaPass(reloaded)).toThrow(UlwLoopError)
  })

  test("quality-gate blockers classify auth + clear fields", () => {
    expect(normalizeBlockerEvidence('Auth "token" missing at https://x')).toContain("auth")
    expect(classifyExternalAuthorizationBlocker("missing token permission")).toBe("EXTERNAL_AUTHORIZATION_REQUIRED")
    expect(classifyExternalAuthorizationBlocker("ghcr unauthorized 401 anonymous pull missing credential")).toContain(
      "GHCR",
    )
    expect(classifyExternalAuthorizationBlocker("normal error")).toBeNull()
    const goal = {
      id: "G001",
      title: "t",
      objective: "o",
      status: "blocked" as const,
      successCriteria: [],
      attempt: 0,
      createdAt: "t",
      updatedAt: "t",
      blockerSignature: "SIG",
      blockerEvidence: "x",
    } as UlwLoopItem
    clearGoalBlockerFields(goal)
    expect((goal as { blockerEvidence?: string }).blockerEvidence).toBeUndefined()
    const plan = {
      version: 1 as const,
      createdAt: "t",
      updatedAt: "t",
      briefPath: "b",
      goalsPath: "g",
      ledgerPath: "l",
      goals: [{ ...goal, blockerSignature: "SIG" }],
    }
    expect(sameBlockerOccurrences(plan, "SIG")).toBe(1)
  })

  test("checkpoint reconciliation true paths with brief mapping", async () => {
    const r = await temp()
    const plan = await createUlwLoopPlan(r, {
      brief: "Ship durable ulw-loop coverage proof with e2e evidence harness for lfg",
      codexGoalMode: "aggregate",
    })
    const started = await startNextUlwLoop(r)
    if (!("goal" in started)) throw new Error("expected goal")
    const goal = started.goal
    const live = await readUlwLoopPlan(r)
    expect(isFinalRunCompletionCandidate(live, goal)).toBe(true)

    const evidence =
      "implementation done and completed for planned work; validation tests passed green and code-review approved clear"
    const snapObj = "Ship durable ulw-loop coverage proof with e2e evidence harness for lfg"
    expect(
      await canReconcileActiveFinalTaskScopedAggregateSnapshot(r, live, goal, snapObj, evidence),
    ).toBe(true)
    expect(
      await canReconcileCompletedTaskScopedAggregateSnapshot(r, live, goal, snapObj, evidence),
    ).toBe(true)
    // non-final false when not final and evidence missing markers
    expect(
      await canReconcileCompletedTaskScopedAggregateSnapshot(r, live, goal, "other", "short"),
    ).toBe(false)
    expect(buildTaskScopedAggregateReconciliationHint(goal, false)).toContain("Completed task-scoped")
    expect(buildTaskScopedAggregateReconciliationHint(goal, true)).toContain("Final task-scoped")
  })

  test("steering: split_subgoal, revise_criterion, reorder, mark_blocked, directive parse, reject weak", async () => {
    const r = await temp()
    // multi-pending plan
    await createUlwLoopPlan(r, {
      brief: "- First pending goal\n- Second pending goal\n- Third pending goal\n",
    })
    let plan = await readUlwLoopPlan(r)
    expect(plan.goals.length).toBeGreaterThanOrEqual(2)
    const g0 = plan.goals[0]!
    const g1 = plan.goals[1]!

    const split = await steerUlwLoop(r, {
      kind: "split_subgoal",
      source: "cli",
      targetGoalId: g0.id,
      childGoals: [
        { title: "Part A", objective: "Do part A" },
        { title: "Part B", objective: "Do part B" },
      ],
      evidence: "scope too wide",
      rationale: "split for delivery",
    })
    expect(split.accepted).toBe(true)
    plan = split.plan
    const supers = plan.goals.find((g) => g.id === g0.id)
    expect(supers?.steeringStatus).toBe("superseded")

    const crit = g1.successCriteria[0]!
    const revise = await steerUlwLoop(r, {
      kind: "revise_criterion",
      source: "finding",
      goalId: g1.id,
      targetGoalId: g1.id,
      criterionId: crit.id,
      scenario: "happy path rewritten",
      expectedEvidence: "tests green",
      evidence: "criterion vague",
      rationale: "make observable",
    } as Parameters<typeof steerUlwLoop>[1])
    expect(revise.accepted).toBe(true)

    const pendingIds = (await readUlwLoopPlan(r)).goals
      .filter((g) => g.status === "pending" && g.steeringStatus === undefined)
      .map((g) => g.id)
    if (pendingIds.length >= 2) {
      const reorder = await steerUlwLoop(r, {
        kind: "reorder_pending",
        source: "cli",
        pendingOrder: [...pendingIds].reverse(),
        evidence: "priority change",
        rationale: "do high risk first",
      })
      expect(reorder.accepted).toBe(true)
    }

    const blockTarget = (await readUlwLoopPlan(r)).goals.find(
      (g) => g.status === "pending" && g.steeringStatus === undefined,
    )
    if (blockTarget) {
      const blocked = await steerUlwLoop(r, {
        kind: "mark_blocked_superseded",
        source: "cli",
        targetGoalId: blockTarget.id,
        evidence: "blocked on auth",
        rationale: "cannot proceed",
        blockedReason: "need token",
      })
      expect(blocked.accepted).toBe(true)
    }

    // reject weak completion
    const weak = validateUlwLoopSteeringProposal(await readUlwLoopPlan(r), {
      kind: "annotate_ledger",
      source: "cli",
      evidence: "skip tests to complete faster",
      rationale: "shortcut",
    })
    expect(weak.invariant.accepted).toBe(false)

    // directive parse
    const directive = parseUlwLoopSteeringDirective(
      `please OMO_ULW_LOOP_STEER: ${JSON.stringify({
        kind: "annotate_ledger",
        source: "cli",
        evidence: "obs",
        rationale: "why",
      })}`,
    )
    expect(directive?.kind).toBe("annotate_ledger")
    expect(parseUlwLoopSteeringDirective("no directive")).toBeNull()

    // applySteeringMutation no-op when rejected
    const audit = validateUlwLoopSteeringProposal(plan, { kind: "nope" })
    const cloned = applySteeringMutation(plan, { kind: "annotate_ledger", source: "cli", evidence: "e", rationale: "r" }, audit)
    expect(cloned.goals.length).toBe(plan.goals.length)

    // cli parse more kinds
    const prop = await parseSteeringProposal([
      "--kind",
      "revise_criterion",
      "--goal-id",
      g1.id,
      "--criterion-id",
      crit.id,
      "--scenario",
      "s",
      "--evidence",
      "e",
      "--rationale",
      "r",
    ])
    expect(prop.kind).toBe("revise_criterion")

    const out: string[] = []
    const o = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((c: string | Uint8Array) => {
      out.push(String(c))
      return true
    }) as typeof process.stdout.write
    try {
      printSteerResult(revise, false)
    } finally {
      process.stdout.write = o
    }
    expect(out.join("")).toContain("ulw-loop steer")
  })

  test("ultrawork directive transcript + skill pointer paths", async () => {
    const r = await temp()
    const transcript = join(r, "t.jsonl")
    await writeFile(
      transcript,
      `${JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "UserPromptSubmit",
          additionalContext: "<ultrawork-mode> already here",
        },
      })}\n`,
      "utf8",
    )
    expect(buildUltraworkDirectiveOutput({ prompt: "ulw please", transcript_path: transcript })).toBe("")
    const pressureTx = join(r, "p.jsonl")
    await writeFile(pressureTx, "context compacted during long run\n", "utf8")
    expect(buildUltraworkDirectiveOutput({ prompt: "ulw", transcript_path: pressureTx })).toBe("")
    expect(buildUltraworkDirectiveOutput({ prompt: "ulw", transcript_path: join(r, "missing") })).toContain(
      "ultrawork-mode",
    )
    const skill = join(r, "SKILL.md")
    await writeFile(skill, "# skill\n", "utf8")
    expect(buildUltraworkSkillPointer(skill)).toContain(skill)
    expect(buildUltraworkAdditionalContext({ skillFilePath: skill })).toContain("<ultrawork-mode>")
    expect(buildUltraworkAdditionalContext({ skillFilePath: join(r, "nope.md") }).length).toBeGreaterThan(0)
  })

  test("paths edge cases and session env", () => {
    expect(normalizeUlwLoopSessionId("...")).toBeNull()
    expect(normalizeUlwLoopSessionId("a//b")).toBe("a-b")
    expect(resolveUlwLoopSessionIdFromEnv({ CODEX_THREAD_ID: " thr " })).toBe("thr")
    expect(repoRelative("C:\\repo\\a", "C:\\repo")).toMatch(/a/)
  })

  test("cli subcommand isUlwLoopSubcommand direct dispatch without prefix", async () => {
    const r = await temp()
    await withCwd(r, async () => {
      const code = await capture(() =>
        dispatchUlwLoopArgv(["create-goals", "--brief", "direct subcommand", "--json"]),
      )
      expect(code.code).toBe(0)
      expect((parseJson(code.out) as { ok: boolean }).ok).toBe(true)
    })
  })

  test("goal-status superseded resolution", async () => {
    const r = await temp()
    await createUlwLoopPlan(r, { brief: "- Parent goal one\n- Child goal two\n" })
    const plan = await readUlwLoopPlan(r)
    const parent = plan.goals[0]!
    await steerUlwLoop(r, {
      kind: "split_subgoal",
      source: "cli",
      targetGoalId: parent.id,
      childGoals: [{ title: "C1", objective: "c1 work" }],
      evidence: "split",
      rationale: "split",
    })
    const after = await readUlwLoopPlan(r)
    const superGoal = after.goals.find((g) => g.id === parent.id)!
    expect(superGoal.steeringStatus).toBe("superseded")
    // complete replacements → isUlwLoopDone can become true if all non-blocking
    for (const g of after.goals) {
      if (g.steeringStatus === "superseded") continue
      g.status = "complete"
    }
    // still may have pending - force complete all non-superseded
    const donePlan = structuredClone(after)
    for (const g of donePlan.goals) {
      if (g.steeringStatus !== "superseded") g.status = "complete"
      else {
        // mark replacement complete
        for (const id of g.supersededBy ?? []) {
          const rep = donePlan.goals.find((x) => x.id === id)
          if (rep) rep.status = "complete"
        }
      }
    }
    expect(isUlwLoopDone(donePlan)).toBe(true)
    void essentialCriteriaOf
  })

  test("record-review-blockers e2e via CLI", async () => {
    const r = await temp()
    await withCwd(r, async () => {
      const created = await capture(() =>
        dispatchUlwLoopArgv(["ulw-loop", "create-goals", "--brief", "review blockers cli", "--json"]),
      )
      const plan = (parseJson(created.out) as { plan: UlwLoopPlan }).plan
      await capture(() => dispatchUlwLoopArgv(["ulw-loop", "complete-goals", "--json"]))
      const goalId = plan.goals[0]!.id
      const objective = plan.codexObjective!
      const rb = await capture(() =>
        dispatchUlwLoopArgv([
          "ulw-loop",
          "record-review-blockers",
          "--goal-id",
          goalId,
          "--title",
          "Fix review",
          "--objective",
          "Address review findings",
          "--evidence",
          "review blocked",
          "--codex-goal-json",
          JSON.stringify({ goal: { objective, status: "active" } }),
          "--json",
        ]),
      )
      expect(rb.code).toBe(0)
      const body = parseJson(rb.out) as { ok: boolean; blockedGoal: { status: string } }
      expect(body.ok).toBe(true)
      expect(body.blockedGoal.status).toBe("review_blocked")
    })
  })
})
