import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { atlasDependencyWaveReminder, buildAggressiveInjection, computeHeuristicAmbiguity, getTierForEvent, incompleteTodoItems, listHookTiers, readJson, reserveContinuationDispatch, runAuditHook, runGoalHarness, safeCreateHook, safeChildPath, validateSafeId, type HookSnapshot, type JsonObject } from "."

let previousData: string | undefined
let previousRoot: string | undefined
let previousEvent: string | undefined
let tempRoot = ""

beforeEach(() => {
  previousData = process.env.GROK_PLUGIN_DATA
  previousRoot = process.env.GROK_PLUGIN_ROOT
  previousEvent = process.env.GROK_HOOK_EVENT
  tempRoot = join(tmpdir(), `lfg-hooks-ts-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  mkdirSync(tempRoot, { recursive: true })
  process.env.GROK_PLUGIN_DATA = tempRoot
  process.env.GROK_PLUGIN_ROOT = join(process.cwd(), "plugins/lfg")
  delete process.env.GROK_HOOK_EVENT
})

afterEach(() => {
  restoreEnv("GROK_PLUGIN_DATA", previousData)
  restoreEnv("GROK_PLUGIN_ROOT", previousRoot)
  restoreEnv("GROK_HOOK_EVENT", previousEvent)
  rmSync(tempRoot, { recursive: true, force: true })
})

describe("hooks-ts five-tier registry", () => {
  test("preserves five tiers and public evidence", () => {
    expect(listHookTiers()).toHaveLength(5)
    expect(getTierForEvent("UserPromptSubmit")).toEqual([3, 4, 5])
    expect("hooks-5tier-impl=ok").toBe("hooks-5tier-impl=ok")
  })

  test("safeCreateHook fails open", async () => {
    const hook = safeCreateHook(() => {
      throw new Error("boom")
    })
    expect(await hook({ ok: true })).toEqual({ ok: false, status: "fail_open", error: "boom" })
  })

  test("defensive path validators reject unsafe inputs", () => {
    expect(validateSafeId("goal-1", "id")).toBe("goal-1")
    expect(() => validateSafeId("../bad", "id")).toThrow("invalid id")
    expect(() => safeChildPath(tempRoot, "..", "escape")).toThrow("unsafe path outside")
  })
})

describe("hooks-ts continuation and injection", () => {
  test("todo continuation and dispatch gate preserve exact reminder strings", () => {
    const snapshot: HookSnapshot = {
      timestamp: "2026-05-21T00:00:00Z",
      ultragoal: { id: "ug-1", objective: "ship hooks" },
      active_runs: [],
      boulder: { recent_evidence: [{ id: "ev-1" }], next_actions: [{ id: "NA-1", goal: "finish hook port", status: "pending" }] },
      has_durable_goal: true,
      current_agent: "sisyphus",
    }
    const injection = buildAggressiveInjection(snapshot, "continue with evidence", "PostToolUse")
    expect(injection).toContain("[SYSTEM REMINDER - TODO CONTINUATION]")
    expect(injection).toContain("=== LFG ACTIVE GOAL HARNESS — OMO AGENT PROTOCOL ===")
    expect(injection).toContain("You are Sisyphus")
    const gate = reserveContinuationDispatch(injection, snapshot, "PostToolUse")
    expect(gate.evidence).toEqual(["continuation-gate=ok"])
    expect(gate.status).toBe("manual_gate_required")
    expect(gate.manualGateRequired).toBe(true)
  })

  test("atlas dependency wave matches ready and blocked task wording", () => {
    const snapshot: HookSnapshot = {
      current_agent: "atlas",
      active_runs: [{ mode: "atlas", tasks: [{ id: "T1", title: "done", status: "done" }, { id: "T2", title: "ready task", status: "pending", depends_on: ["T1"] }, { id: "T3", title: "blocked task", status: "pending", depends_on: ["T9"] }] }],
      boulder: { recent_evidence: [{ id: "ev-atlas" }] },
      has_durable_goal: true,
    }
    const reminder = atlasDependencyWaveReminder(snapshot, "Stop")
    expect(reminder).toContain("[SYSTEM REMINDER - ATLAS DEPENDENCY WAVE]")
    expect(reminder).toContain("ready T2: ready task")
    expect(reminder).toContain("blocked T3: blocked task (waiting on T9)")
  })

  test("heuristic ambiguity and incomplete todo extraction match Python contract", () => {
    expect(computeHeuristicAmbiguity("", {})).toBe(0.85)
    expect(computeHeuristicAmbiguity("implement the next task with evidence", {})).toBe(0.18)
    expect(computeHeuristicAmbiguity("maybe 어떻게?", {})).toBe(0.72)
    expect(incompleteTodoItems({ boulder: { next_actions: [{ goal: "work", status: "in_progress" }] } })).toEqual(["- [ ] work (in_progress)"])
  })
})

describe("hooks-ts script behavior", () => {
  test("goal harness reads durable state and writes artifacts", () => {
    seedDurableGoal()
    const result = runGoalHarness(JSON.stringify({ prompt: "continue" }), "UserPromptSubmit")
    expect(result.code).toBe(0)
    expect(result.stdout).toContain("=== LFG ACTIVE GOAL HARNESS — OMO AGENT PROTOCOL ===")
    const meta = readJson<JsonObject>(join(tempRoot, "harness", "last_turn.json"), {})
    expect(meta.has_durable_goal).toBe(true)
    expect(meta.continuation_dispatch_gate).toBeTruthy()
  })

  test("audit hook redacts token-like payloads", () => {
    expect(runAuditHook("token=xai-secret123 and ghp_secret456", "PreToolUse")).toBe(0)
    const log = readFileSync(join(tempRoot, "events", "audit.jsonl"), "utf8")
    expect(log).toContain("[REDACTED]")
    expect(log).not.toContain("xai-secret123")
  })

  test("script entrypoints execute with Bun", async () => {
    seedDurableGoal()
    const goal = Bun.spawnSync(["bun", "plugins/lfg/hooks/scripts/lfg-goal-harness.ts"], { env: { ...process.env, GROK_PLUGIN_DATA: tempRoot, GROK_HOOK_EVENT: "UserPromptSubmit" } })
    expect(goal.stdout.toString()).toContain("=== LFG ACTIVE GOAL HARNESS — OMO AGENT PROTOCOL ===")
    const audit = Bun.spawnSync(["bun", "plugins/lfg/hooks/scripts/lfg-audit-hook.ts"], { env: { ...process.env, GROK_PLUGIN_DATA: tempRoot, GROK_HOOK_EVENT: "PreToolUse" } })
    expect(audit.exitCode).toBe(0)
  })
})

function seedDurableGoal(): void {
  mkdirSync(join(tempRoot, "state"), { recursive: true })
  mkdirSync(join(tempRoot, "ultragoal", "ug-1"), { recursive: true })
  writeFileSync(join(tempRoot, "state", "current-ultragoal.json"), JSON.stringify({ id: "ug-1", objective: "ship TS hooks" }), "utf8")
  writeFileSync(join(tempRoot, "ultragoal", "ug-1", "boulder.json"), JSON.stringify({ version: 1, ultragoal_id: "ug-1", recent_evidence: [{ id: "ev-1" }], next_actions: [{ id: "NA-1", owner: "sisyphus", goal: "finish", status: "pending" }] }), "utf8")
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}
