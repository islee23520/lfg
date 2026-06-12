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

import * as tui from "./lfg-setup-tui";

describe("lfg-setup-tui (Clack TUI for bare setup)", () => {
  test("shouldUseSetupTui returns true only for real TTY + not check + not --no-tui", () => {
    expect(tui.shouldUseSetupTui({}, { check: false, input: { isTTY: true }, output: { isTTY: true } })).toBe(true);
    expect(tui.shouldUseSetupTui({}, { check: false, input: { isTTY: false }, output: { isTTY: true } })).toBe(false);
    expect(tui.shouldUseSetupTui({ noTui: true }, { check: false, input: { isTTY: true }, output: { isTTY: true } })).toBe(false);
    expect(tui.shouldUseSetupTui({}, { check: true, input: { isTTY: true }, output: { isTTY: true } })).toBe(false);
  });

  test("runSetupTui runs the line setup with noTui:true, captures its console output into a note, and shows LFG framing + outro", async () => {
    const prompts = await import("@clack/prompts") as any;
    const calls: any[] = prompts.__calls;
    calls.length = 0;

    const lineLogs: string[] = [];
    const runLineSetup = async (args: any, _ctx: any, _opts: any) => {
      // Simulate what the classic wizard would print to stdout during setup.
      console.log("lfg setup: installed Grok adapter (simulated)");
      console.log("[1/5] Discovering Grok model endpoint");
      lineLogs.push("ran-with-noTui=" + String(args?.noTui));
    };

    await tui.runSetupTui({}, { plan: {}, resolved: null }, {
      prompts: prompts as any,
      colors: { inverse: (s: string) => s, green: (s: string) => s },
      runLineSetup,
    });

    // Framing
    expect(calls.some((c: any[]) => c[0] === "intro" && /LFG setup/.test(String(c[1])))).toBe(true);
    expect(calls.some((c: any[]) => c[0] === "note" && /Grok adapter overlay/.test(String(c[1])))).toBe(true);

    // Confirm was asked
    expect(calls.some((c: any[]) => c[0] === "confirm")).toBe(true);

    // Results from the line wizard were captured into a "Setup results" note
    expect(calls.some((c: any[]) => c[0] === "note" && /Setup results/.test(String(c[1])))).toBe(true);
    expect(calls.some((c: any[]) => c[0] === "note" && /lfg setup: installed Grok adapter/.test(String(c[2])))).toBe(true);

    // Outro
    expect(calls.some((c: any[]) => c[0] === "outro")).toBe(true);

    // The line implementation was invoked with the forced noTui flag
    expect(lineLogs.some((l) => l.includes("ran-with-noTui=true"))).toBe(true);
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
