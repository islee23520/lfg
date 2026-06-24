import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import type { BoulderState, BoulderWorkState } from "./vendor/boulder-state-vendored";
import {
  createBoulderState,
  getBoulderFilePath,
  getPlanChecklist,
  getWorkForSession,
  parsePlanChecklist,
  readBoulderState,
  writeBoulderState,
} from "./vendor/boulder-state-vendored";

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

describe("boulder-state-vendored plan checklist", () => {
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

describe("boulder-state-vendored storage", () => {
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
