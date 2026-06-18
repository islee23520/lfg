import { describe, expect, test, vi } from "vitest";

// We test the pure logic + the TUI runner with a fully mocked @clack/prompts surface.
// This mirrors LFP's setup-tui.test.mjs structure but for the lfg adapter.

vi.mock("@clack/prompts", () => {
  const calls: any[] = [];
  const prompts: any = {
    intro: (m: string) => calls.push(["intro", m]),
    note: (m: string, title?: string) => calls.push(["note", title, m]),
    confirm: async (opts: any) => {
      calls.push(["confirm", opts?.message]);
      return true;
    },
    select: async (opts: any) => {
      calls.push(["select", opts?.message, opts?.options?.length, opts?.initialValue]);
      return opts?.options?.[0]?.value ?? "grok-3-mini-fast";
    },
    autocomplete: async (opts: any) => {
      calls.push(["autocomplete", opts?.message, opts?.options?.length, opts?.initialValue, opts?.options]);
      return opts?.initialValue ?? opts?.options?.[0]?.value ?? "grok-3-mini-fast";
    },
    isCancel: (v: any) => v === Symbol.for("clack-cancel"),
    cancel: (m: string) => calls.push(["cancel", m]),
    outro: (m: string) => calls.push(["outro", m]),
  };
  return {
    ...prompts,
    __calls: calls,
    default: prompts,
  };
});

vi.mock("picocolors", () => ({
  default: {
    inverse: (s: string) => s,
    green: (s: string) => s,
  },
}));

const installerMock = vi.hoisted(() => ({
  runLazycodexInstaller: vi.fn(async () => ({ ok: true, stdout: "", stderr: "" })),
}));

vi.mock("./lfg-installer.js", () => installerMock);

import * as tui from "./lfg-setup-tui";

describe("lfg-setup-tui (Clack TUI for bare setup)", () => {
  test("shouldUseSetupTui returns true only for real TTY + not check + not --no-tui", () => {
    expect(tui.shouldUseSetupTui({}, { check: false, input: { isTTY: true }, output: { isTTY: true } })).toBe(true);
    expect(tui.shouldUseSetupTui({}, { check: false, input: { isTTY: false }, output: { isTTY: true } })).toBe(false);
    expect(tui.shouldUseSetupTui({ noTui: true }, { check: false, input: { isTTY: true }, output: { isTTY: true } })).toBe(false);
    expect(tui.shouldUseSetupTui({}, { check: true, input: { isTTY: true }, output: { isTTY: true } })).toBe(false);
  });

  test("runSetupTui (self-contained Clack TUI) shows LFG framing, performs role selects, emits only clean role summaries into 'Setup results', shows its own Install Summary + final confirm, and outro", async () => {
    const prompts = await import("@clack/prompts") as any;
    const calls: any[] = prompts.__calls;
    calls.length = 0;

    // For the self-contained TUI we do not need (and do not primarily use) a runLineSetup
    // for the role questioning phase. The runner does the three Clack selects itself
    // (explorer/reasoning/coding) and only ever prints the terse summaries via console.log.
    // We still accept a legacy shim to prove we don't explode if one is passed.
    const lineLogs: string[] = [];
    const runLineSetup = async (args: any, _ctx: any, _opts: any) => {
      lineLogs.push("legacy-runLineSetup-called-with-noTui=" + String(args?.noTui));
    };

    await tui.runSetupTui({}, { plan: {}, resolved: { discovery: { baseUrl: "http://127.0.0.1:8317/v1", modelsUrl: "http://127.0.0.1:8317/v1/models", modelIds: ["grok-3-mini-fast", "grok-4.20-0309-reasoning", "gpt-5.3-codex-spark"], mapping: { default: "grok-3-mini-fast", fast: "grok-3-mini-fast", reasoning: "grok-4.20-0309-reasoning", coding: "gpt-5.3-codex-spark" } } } }, {
      prompts: prompts as any,
      colors: { inverse: (s: string) => s, green: (s: string) => s },
      runLineSetup,
    });

    // Framing
    expect(calls.some((c: any[]) => c[0] === "intro" && /LFG setup/.test(String(c[1])))).toBe(true);
    expect(calls.some((c: any[]) => c[0] === "note" && /Grok adapter overlay/.test(String(c[1])))).toBe(true);

    // Initial "Continue with lfg setup?" confirm + final "Install now?" confirm (both from the TUI itself)
    const confirmCalls = calls.filter((c: any[]) => c[0] === "confirm");
    expect(confirmCalls.length).toBeGreaterThanOrEqual(2);

    const selectCalls = calls.filter((c: any[]) => c[0] === "select");
    const autocompleteCalls = calls.filter((c: any[]) => c[0] === "autocomplete");
    expect(selectCalls.length + autocompleteCalls.length).toBeGreaterThanOrEqual(9);

    // The self-contained TUI produces a "Setup results" note containing only the clean role summaries
    // (e.g. "  explorer: grok-3-mini-fast / low (tier: default)").
    // No "Current:", "Default: keep...", "Recommended:", "Alternatives:", long-tail "Configure other...",
    // plan review, magic word, "Install now? [y/N]", cancelled text, or oMo bye may appear in it.
    expect(calls.some((c: any[]) => c[0] === "note" && /Setup results/.test(String(c[1])))).toBe(true);
    expect(calls.some((c: any[]) => c[0] === "note" && /Model recommendations/.test(String(c[1])) && /Agent Model Recommendations/.test(String(c[2])))).toBe(true);
    expect(calls.some((c: any[]) => c[0] === "note" && /explorer model recommendation/.test(String(c[1])) && /Recommended:/.test(String(c[2])) && /Fallback chain:/.test(String(c[2])))).toBe(true);
    expect(calls.some((c: any[]) => c[0] === "note" && /coding model recommendation/.test(String(c[1])) && /Recommended:/.test(String(c[2])))).toBe(true);
    expect(calls.some((c: any[]) => c[0] === "note" && /sisyphus model recommendation/.test(String(c[1])) && /Fallback chain:/.test(String(c[2])))).toBe(true);
    expect(calls.some((c: any[]) => c[0] === "note" && /atlas model recommendation/.test(String(c[1])) && /Fallback chain:/.test(String(c[2])))).toBe(true);
    expect(calls.some((c: any[]) => c[0] === "note" && /oracle model recommendation/.test(String(c[1])) && /Fallback chain:/.test(String(c[2])))).toBe(true);

    const resultsNote = calls.find((c: any[]) => c[0] === "note" && /Setup results/.test(String(c[1])));
    const resultsBody = resultsNote ? String(resultsNote[2] || "") : "";
    const expectedSummarizedAgents = [
      "explorer",
      "reasoning",
      "coding",
      "default",
      "prometheus",
      "librarian",
      "plan",
      "metis",
      "momus",
      "codex-ultrawork-reviewer",
    ] as const;
    for (const agentName of expectedSummarizedAgents) {
      expect(new RegExp(`${agentName}:.*\\/.*\\(tier:`).test(resultsBody)).toBe(true);
    }
    // Must NOT contain classic readline pollution
    expect(/Current: .* \(reasoning:/.test(resultsBody)).toBe(false);
    expect(/Default: keep the current LazyCodex\/OMO value/.test(resultsBody)).toBe(false);
    expect(/^\s*Recommended:/m.test(resultsBody)).toBe(false);
    expect(/^\s*Alternatives:/m.test(resultsBody)).toBe(false);
    expect(/Configure other LazyCodex agents/i.test(resultsBody)).toBe(false);
    expect(calls.some((c: any[]) => c[0] === "note" && /Why two model steps/.test(String(c[1])) && /first 3 prompts/.test(String(c[2])) && /named OMO\/ultrawork agents/.test(String(c[2])))).toBe(true);
    expect(calls.some((c: any[]) => c[0] === "confirm" && /Customize Core \+ ULW named agent overrides/.test(String(c[1])))).toBe(true);
    expect(autocompleteCalls.some((c: any[]) => Array.isArray(c[4]) && c[4].some((option: any) => /recommended/.test(String(option?.hint ?? ""))))).toBe(true);

    // The TUI shows its own clean "Install Summary" (not the classic printInstallPlan + Magic Word)
    expect(calls.some((c: any[]) => c[0] === "note" && /Install Summary/.test(String(c[1])))).toBe(true);

    // Final outro from the TUI
    expect(calls.some((c: any[]) => c[0] === "outro")).toBe(true);
    const outroText = calls.filter((c: any[]) => c[0] === "outro").map((c: any[]) => String(c[1])).join("\n");
    expect(outroText).toContain("lfg --json setup --run");
    expect(outroText).not.toContain("lfg doctor");

    // If a legacy runLineSetup was supplied it may have been called (for compatibility),
    // but it is not the source of the "Setup results" content for the primary TUI path.
    // We only assert it didn't blow up.
  });

  test("runSetupTui cancel path throws and shows cancel framing (no line setup side effects)", async () => {
    const prompts = await import("@clack/prompts") as any;
    const calls: any[] = prompts.__calls;
    calls.length = 0;

    // Force the confirm to return the cancel token
    const CANCEL = Symbol.for("clack-cancel");
    const runLineSetup = vi.fn();

    // We reach into the mocked confirm by temporarily overriding it for this test case.
    const origConfirm = prompts.confirm;
    prompts.confirm = async () => CANCEL;

    await expect(
      tui.runSetupTui({}, { plan: {}, resolved: null }, {
        prompts: prompts as any,
        colors: { inverse: (s: string) => s, green: (s: string) => s },
        runLineSetup,
      }),
    ).rejects.toThrow(/cancelled/);

    prompts.confirm = origConfirm;

    expect(calls.some((c: any[]) => c[0] === "cancel")).toBe(true);
    expect(runLineSetup).not.toHaveBeenCalled();
  });

});
