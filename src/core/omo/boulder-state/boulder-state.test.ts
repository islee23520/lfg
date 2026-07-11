import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import type { BoulderState, BoulderWorkState, StopHookContinuationContext } from "./index";
import {
  createBoulderState,
  getBoulderFilePath,
  getPlanChecklist,
  getStopHookContinuationContext,
  getWorkForSession,
  parsePlanChecklist,
  readBoulderState,
  writeBoulderState,
} from "./index";

const cleanupRoots: string[] = [];

afterEach(async () => {
  await Promise.all(cleanupRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function createTempDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  cleanupRoots.push(directory);
  return directory;
}

function createWork(input: {
  readonly workId: string;
  readonly sessionIds: readonly string[];
  readonly startedAt: string;
  readonly updatedAt?: string;
}): BoulderWorkState {
  return {
    work_id: input.workId,
    active_plan: `.omo/plans/${input.workId}.md`,
    plan_name: input.workId,
    status: "active",
    started_at: input.startedAt,
    ...(input.updatedAt !== undefined ? { updated_at: input.updatedAt } : {}),
    session_ids: [...input.sessionIds],
  };
}

function createState(works: readonly BoulderWorkState[]): BoulderState {
  const firstWork = works[0];
  if (!firstWork) {
    throw new Error("test state requires at least one work");
  }

  return {
    schema_version: 2,
    active_work_id: firstWork.work_id,
    works: Object.fromEntries(works.map((work) => [work.work_id, work])),
    active_plan: firstWork.active_plan,
    plan_name: firstWork.plan_name,
    status: firstWork.status,
    started_at: firstWork.started_at,
    updated_at: firstWork.updated_at,
    session_ids: [...firstWork.session_ids],
    session_origins: {},
    task_sessions: {},
  };
}

describe("boulder-state plan checklist", () => {
  test("parsePlanChecklist counts top-level TODO and final verification checkboxes", () => {
    const markdown = [
      "# Plan",
      "- [ ] Preamble task",
      "## TODOs",
      "- [ ] First",
      "- [x] Done",
      "  - [ ] Nested",
      "## Acceptance Criteria",
      "- [ ] Ignored",
      "## Final Verification Wave",
      "- [X] Verified",
      "- [ ] Final",
    ].join("\n");

    expect(parsePlanChecklist(markdown)).toEqual({
      completed: 2,
      remaining: 2,
      total: 4,
      nextTaskLabel: "First",
    });
  });

  test("parsePlanChecklist counts all top-level checkboxes when no counted sections exist", () => {
    expect(parsePlanChecklist(["# Plan", "- [ ] First", "- [x] Done", "  - [ ] Nested"].join("\n"))).toEqual({
      completed: 1,
      remaining: 1,
      total: 2,
      nextTaskLabel: "First",
    });
  });

  test("getPlanChecklist reads concrete files and returns empty results for missing plans", async () => {
    const directory = await createTempDirectory("lfg-boulder-plan-checklist-");
    const planPath = join(directory, "plan.md");
    await writeFile(planPath, "## TODOs\n- [x] First\n- [X] Second\n", "utf8");

    expect(getPlanChecklist(planPath)).toEqual({ completed: 2, remaining: 0, total: 2, nextTaskLabel: null });
    expect(getPlanChecklist(join(directory, "missing.md"))).toEqual({
      completed: 0,
      remaining: 0,
      total: 0,
      nextTaskLabel: null,
    });
  });
});

describe("boulder-state storage", () => {
  test("readBoulderState returns null for missing, malformed, and non-object state files", async () => {
    const missingDirectory = await createTempDirectory("lfg-boulder-read-missing-");
    expect(readBoulderState(missingDirectory)).toBeNull();

    const malformedDirectory = await createTempDirectory("lfg-boulder-read-malformed-");
    await mkdir(join(malformedDirectory, ".omo"), { recursive: true });
    await writeFile(join(malformedDirectory, ".omo", "boulder.json"), "{not-json", "utf8");
    expect(readBoulderState(malformedDirectory)).toBeNull();

    const nonObjectDirectory = await createTempDirectory("lfg-boulder-read-non-object-");
    await mkdir(join(nonObjectDirectory, ".omo"), { recursive: true });
    await writeFile(join(nonObjectDirectory, ".omo", "boulder.json"), "[]", "utf8");
    expect(readBoulderState(nonObjectDirectory)).toBeNull();
  });

  test("writeBoulderState round-trips state through an isolated directory", async () => {
    const directory = await createTempDirectory("lfg-boulder-round-trip-");
    const state = createBoulderState(".omo/plans/implement-feature.md", "opencode:sess-a", "atlas");

    expect(writeBoulderState(directory, state)).toBe(true);
    expect(getBoulderFilePath(directory)).toBe(join(directory, ".omo", "boulder.json"));

    const readState = readBoulderState(directory);
    expect(readState).not.toBeNull();
    expect(readState?.active_plan).toBe(".omo/plans/implement-feature.md");
    expect(readState?.plan_name).toBe("implement-feature");
    expect(readState?.session_ids).toEqual(["opencode:sess-a"]);
    expect(readState?.works?.[readState.active_work_id ?? ""]?.agent).toBe("atlas");
  });

  test("getWorkForSession chooses the newest matching work and falls back to mirror state", async () => {
    const directory = await createTempDirectory("lfg-boulder-session-");
    const state = createState([
      createWork({
        workId: "older",
        sessionIds: ["opencode:sess-a"],
        startedAt: "2026-06-05T01:00:00.000Z",
        updatedAt: "2026-06-05T02:00:00.000Z",
      }),
      createWork({
        workId: "newest",
        sessionIds: ["opencode:sess-a"],
        startedAt: "2026-06-05T01:30:00.000Z",
        updatedAt: "2026-06-05T03:00:00.000Z",
      }),
    ]);
    expect(writeBoulderState(directory, state)).toBe(true);

    expect(getWorkForSession(directory, "sess-a")?.work_id).toBe("newest");

    const mirrorDirectory = await createTempDirectory("lfg-boulder-mirror-");
    expect(writeBoulderState(mirrorDirectory, {
      schema_version: 2,
      active_plan: ".omo/plans/mirror.md",
      plan_name: "mirror",
      status: "active",
      started_at: "2026-06-05T01:00:00.000Z",
      session_ids: ["opencode:sess-a"],
      session_origins: { "opencode:sess-a": "direct" },
      task_sessions: {},
    })).toBe(true);

    expect(getWorkForSession(mirrorDirectory, "sess-a")?.work_id).toBe("mirror-legacy");
  });
});

describe("getStopHookContinuationContext (task 6: continuation plane)", () => {
  test("malformed .omo fails closed", async () => {
    const directory = await createTempDirectory("boulder-continuation-malformed-");
    await mkdir(join(directory, ".omo"), { recursive: true })
    await writeFile(
      join(directory, ".omo", "boulder.json"),
      "{invalid: json",
      "utf8"
    )

    const ctx: StopHookContinuationContext = getStopHookContinuationContext(directory)
    expect(ctx.status).toBe("malformed")
    expect(ctx.additionalContext).toContain("malformed .omo/boulder.json fails closed")
    expect(ctx.ledgerPath).toContain("ledger.jsonl")
    expect(ctx.hasActiveWork).toBe(false)
    expect(ctx.resumeOptions).toEqual([])
  })

  test("happy path emits ledger path and structured continuation context", async () => {
    const directory = await createTempDirectory("boulder-continuation-happy-");
    await mkdir(join(directory, ".omo", "start-work"), { recursive: true })
    await mkdir(join(directory, ".omo", "plans"), { recursive: true })

    const validState = createState([
      createWork({
        workId: "test-work",
        sessionIds: ["grok:test"],
        startedAt: "2026-07-09T12:00:00.000Z",
      }),
    ])
    expect(writeBoulderState(directory, validState)).toBe(true)

    // create a sample plan with unchecked item
    await writeFile(
      join(directory, ".omo", "plans", "test-work.md"),
      "# Test Plan\n\n## TODOs\n- [ ] Implement continuation helper\n- [x] Setup test",
      "utf8"
    )

    const ctx: StopHookContinuationContext = getStopHookContinuationContext(directory)
    expect(ctx.status).toBe("present")
    expect(ctx.additionalContext).toContain("Grok ledger-backed start-work continuation context")
    expect(ctx.additionalContext).toContain("ledger")
    expect(ctx.hasActiveWork).toBe(true)
    expect(ctx.activeWorkId).toBe("test-work")
    expect(ctx.checklist?.remaining).toBe(1)
    expect(ctx.ledgerPath).toContain("ledger.jsonl")
    expect(ctx.resumeOptions.length).toBeGreaterThan(0)
  })
})

/**
 * Characterization + RED for start-work-continuation proven-resume contract (T4 / #94).
 *
 * GREEN pins: valid boulder → ledgerPath + structured fields; malformed .omo → fail-closed.
 * RED gap: present Stop continuation context must name the durable resume CLI
 * (`lfg ulw-loop` or equivalent) and must not claim automatic reinjection.
 * Production GREEN for that resume pointer is intentionally deferred to a later task.
 */
describe("getStopHookContinuationContext proven resume contract (T4 characterization + RED)", () => {
  async function writeValidActiveBoulder(directory: string): Promise<void> {
    await mkdir(join(directory, ".omo", "start-work"), { recursive: true })
    await mkdir(join(directory, ".omo", "plans"), { recursive: true })
    const validState = createState([
      createWork({
        workId: "resume-work",
        sessionIds: ["grok:resume-session"],
        startedAt: "2026-07-11T00:00:00.000Z",
      }),
    ])
    expect(writeBoulderState(directory, validState)).toBe(true)
    await writeFile(
      join(directory, ".omo", "plans", "resume-work.md"),
      "# Resume Plan\n\n## TODOs\n- [ ] Continue work\n- [x] Seeded\n",
      "utf8",
    )
  }

  test("characterization: valid boulder pins ledgerPath under .omo/start-work and present status", async () => {
    const directory = await createTempDirectory("boulder-t4-char-happy-")
    await writeValidActiveBoulder(directory)

    const ctx = getStopHookContinuationContext(directory)
    expect(ctx.status).toBe("present")
    expect(ctx.ledgerPath).toBe(join(directory, ".omo", "start-work", "ledger.jsonl"))
    expect(ctx.boulderPath).toBe(join(directory, ".omo", "boulder.json"))
    expect(ctx.hasActiveWork).toBe(true)
    expect(ctx.activeWorkId).toBe("resume-work")
    expect(ctx.planPath).toContain("resume-work.md")
    expect(ctx.checklist).toMatchObject({ remaining: 1, nextTaskLabel: "Continue work" })
    expect(ctx.resumeOptions.some((option) => option.work_id === "resume-work")).toBe(true)
    // Honesty pin: guidance must not claim host auto-restart / auto-reinjection is available.
    expect(ctx.additionalContext).toMatch(/do not rely on host Stop hook for auto-restart/i)
    expect(ctx.additionalContext).not.toMatch(
      /\b(will|does|performs|enables)\s+automatic\s+reinjection\b/i,
    )
  })

  test("characterization: malformed .omo fails closed without active resume options", async () => {
    const directory = await createTempDirectory("boulder-t4-char-malformed-")
    await mkdir(join(directory, ".omo"), { recursive: true })
    await writeFile(join(directory, ".omo", "boulder.json"), "{not-valid-json", "utf8")

    const ctx = getStopHookContinuationContext(directory)
    expect(ctx.status).toBe("malformed")
    expect(ctx.hasActiveWork).toBe(false)
    expect(ctx.activeWorkId).toBeNull()
    expect(ctx.planPath).toBeNull()
    expect(ctx.checklist).toBeNull()
    expect(ctx.resumeOptions).toEqual([])
    expect(ctx.ledgerPath).toBe(join(directory, ".omo", "start-work", "ledger.jsonl"))
    expect(ctx.additionalContext).toContain("malformed .omo/boulder.json fails closed")
    expect(ctx.additionalContext).toMatch(/no automatic reinjection/i)
  })

  test("characterization: absent boulder fails closed with empty resume surface", async () => {
    const directory = await createTempDirectory("boulder-t4-char-absent-")
    const ctx = getStopHookContinuationContext(directory)
    expect(ctx.status).toBe("absent")
    expect(ctx.hasActiveWork).toBe(false)
    expect(ctx.resumeOptions).toEqual([])
    expect(ctx.additionalContext).toContain("no active boulder state")
    expect(ctx.additionalContext).toMatch(/no automatic reinjection/i)
  })

  /**
   * RED — proven resume contract (gap vs current production wording).
   * Present Stop/SubagentStop continuation context must give an actionable durable-CLI
   * resume pointer (`lfg ulw-loop` / `lfg ulw`) and must deny automatic reinjection
   * with an explicit honesty phrase (not only "auto-restart").
   */
  test("RED proven resume: present context must name durable CLI resume pointer and deny automatic reinjection", async () => {
    const directory = await createTempDirectory("boulder-t4-red-proven-resume-")
    await writeValidActiveBoulder(directory)

    const ctx = getStopHookContinuationContext(directory)
    expect(ctx.status).toBe("present")
    expect(ctx.ledgerPath).toContain(join(".omo", "start-work", "ledger.jsonl"))

    // Actionable resume pointer: durable CLI packaged by lfg (orchestration-plane substitute).
    const namesDurableCli =
      /\blfg\s+ulw-loop\b/i.test(ctx.additionalContext) ||
      /\blfg\s+ulw\b/i.test(ctx.additionalContext)
    expect(
      namesDurableCli,
      "present Stop continuation context must name durable CLI (`lfg ulw-loop` or `lfg ulw`) as resume pointer",
    ).toBe(true)

    // Explicit no-auto-reinjection honesty on the present path (malformed already has this phrase).
    expect(
      ctx.additionalContext,
      "present Stop continuation context must explicitly deny automatic reinjection",
    ).toMatch(/no automatic reinjection|automatic reinjection remains (unclaimed|Deferred)|does not (?:perform |claim )?automatic reinjection/i)

    // Must not over-claim a host reinjection surface.
    expect(ctx.additionalContext).not.toMatch(
      /\b(will|does|performs|enables)\s+automatic\s+reinjection\b/i,
    )
  })
})
