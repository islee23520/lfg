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
