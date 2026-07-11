import { describe, expect, test } from "vitest";

describe("lfg-sisyphus-hooks SubagentStop evidence wiring (#95)", () => {
  test("subagentStopContext includes evidence verification status", async () => {
    const mod = await import("../assets/hooks/lfg-sisyphus-hooks.mjs");
    const ctx = mod.subagentStopContext({
      hookEventName: "SubagentStop",
      last_assistant_message: "Completed task. npm run verify passed with 597 tests. Changed src/foo.ts.",
    });
    expect(ctx.statusLabel).toBe("Delegation result verification");
    expect(ctx.body).toContain("Evidence verification: verified");
  });

  test("subagentStopContext flags missing evidence", async () => {
    const mod = await import("../assets/hooks/lfg-sisyphus-hooks.mjs");
    const ctx = mod.subagentStopContext({
      hookEventName: "SubagentStop",
      last_assistant_message: "Done.",
    });
    expect(ctx.body).toContain("Evidence verification: missing_evidence");
    expect(ctx.body).toContain("Missing:");
  });

  test("subagentStopContext references durable continuation via lfg ulw-loop", async () => {
    const mod = await import("../assets/hooks/lfg-sisyphus-hooks.mjs");
    const ctx = mod.subagentStopContext({ hookEventName: "SubagentStop" });
    expect(ctx.body).toContain("lfg ulw-loop");
  });
});

/**
 * T4 characterization + RED: Stop/SubagentStop continuation resume contract.
 * SubagentStop already names `lfg ulw-loop` (GREEN pin). Stop final-review guidance
 * must also expose a durable resume pointer and must not claim automatic reinjection.
 */
describe("lfg-sisyphus-hooks Stop proven resume contract (T4)", () => {
  test("characterization: SubagentStop body names durable CLI and does not claim automatic reinjection", async () => {
    const mod = await import("../assets/hooks/lfg-sisyphus-hooks.mjs");
    const ctx = mod.subagentStopContext({ hookEventName: "SubagentStop" });
    expect(ctx.body).toMatch(/\blfg\s+ulw-loop\b/i);
    expect(ctx.body).not.toMatch(/\b(will|does|performs|enables)\s+automatic\s+reinjection\b/i);
  });

  test("RED proven resume: Stop context must name durable CLI resume pointer and deny automatic reinjection", async () => {
    const mod = await import("../assets/hooks/lfg-sisyphus-hooks.mjs");
    const ctx = mod.renderSisyphusContext("Stop", { hookEventName: "Stop" });
    expect(ctx).not.toBeNull();
    const body = ctx?.body ?? "";
    expect(body).toContain("sisyphus-final-review-gate");

    const namesDurableCli = /\blfg\s+ulw-loop\b/i.test(body) || /\blfg\s+ulw\b/i.test(body);
    expect(
      namesDurableCli,
      "Stop additionalContext must name durable CLI (`lfg ulw-loop` or `lfg ulw`) as resume pointer",
    ).toBe(true);

    expect(
      body,
      "Stop additionalContext must explicitly deny automatic reinjection",
    ).toMatch(
      /no automatic reinjection|automatic reinjection remains (unclaimed|Deferred)|does not (?:perform |claim )?automatic reinjection/i,
    );

    expect(body).not.toMatch(/\b(will|does|performs|enables)\s+automatic\s+reinjection\b/i);
  });
});
