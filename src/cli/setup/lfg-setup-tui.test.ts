import { describe, expect, test, vi } from "vitest";

// We test the pure logic + the TUI runner with a fully mocked @clack/prompts surface.
// This mirrors LFP's setup-tui.test.mjs structure but for the lfg adapter.

vi.mock("@clack/prompts", () => {
  const calls: any[] = [];
  let codingToolAdapterChoice = "grok";
  const prompts: any = {
    intro: (m: string) => calls.push(["intro", m]),
    note: (m: string, title?: string) => calls.push(["note", title, m]),
    confirm: async (opts: any) => {
      calls.push(["confirm", opts?.message]);
      if (/Install\/update the lfg CLI globally/i.test(String(opts?.message ?? ""))) return false;
      if (/Modify recommended model settings/i.test(String(opts?.message ?? ""))) return false;
      return true;
    },
    select: async (opts: any) => {
      calls.push(["select", opts?.message, opts?.options?.length, opts?.initialValue, opts?.options]);
      if (/Coding tool adapter/i.test(String(opts?.message ?? ""))) return codingToolAdapterChoice;
      if (/Global model preset/i.test(String(opts?.message ?? ""))) return "auto";
      if (/Global reasoning effort/i.test(String(opts?.message ?? ""))) return "high";
      if (/Model customization/i.test(String(opts?.message ?? ""))) return "none";
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
    __setCodingToolAdapterChoice: (value: string) => {
      codingToolAdapterChoice = value;
    },
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

  test("runSetupTui accepts LLM recommendations without per-agent model prompts", async () => {
    const prompts = await import("@clack/prompts") as any;
    const calls: any[] = prompts.__calls;
    calls.length = 0;
    installerMock.runLazycodexInstaller.mockClear();

    // For the self-contained TUI we do not need (and do not primarily use) a runLineSetup
    // for the role questioning phase. The runner does the three Clack selects itself
    // (explorer/reasoning/coding) and only ever prints the terse summaries via console.log.
    // We still accept a legacy shim to prove we don't explode if one is passed.
    const lineLogs: string[] = [];
    const runLineSetup = async (args: any, _ctx: any, _opts: any) => {
      lineLogs.push("legacy-runLineSetup-called-with-noTui=" + String(args?.noTui));
    };

    await tui.runSetupTui({}, { plan: {}, resolved: { discovery: { baseUrl: "http://127.0.0.1:8317/v1", modelsUrl: "http://127.0.0.1:8317/v1/models", modelIds: ["gpt-5.5", "glm-5-turbo", "grok-composer-2.5-fast", "grok-3-mini-fast", "grok-4.20-0309-reasoning", "gpt-5.3-codex-spark"], mapping: { default: "gpt-5.5", fast: "glm-5-turbo", reasoning: "gpt-5.5", coding: "grok-composer-2.5-fast" } } } }, {
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

    const confirmMessages = confirmCalls.map((c: any[]) => String(c[1]));
    expect(confirmMessages).toEqual(expect.arrayContaining([
      "Use LLM recommendations from your available models?",
      "Modify recommended model settings?",
    ]));

    const selectCalls = calls.filter((c: any[]) => c[0] === "select");
    const autocompleteCalls = calls.filter((c: any[]) => c[0] === "autocomplete");
    expect(selectCalls.map((c: any[]) => String(c[1]))).not.toEqual(expect.arrayContaining(["Global model preset", "Global reasoning effort", "Model customization"]));
    expect(autocompleteCalls).toHaveLength(0);

    expect(calls.some((c: any[]) => c[0] === "note" && /Setup results/.test(String(c[1])))).toBe(true);
    const resultsNote = calls.find((c: any[]) => c[0] === "note" && /Setup results/.test(String(c[1])));
    const resultsBody = resultsNote ? String(resultsNote[2] || "") : "";
    expect(resultsBody).toContain("LLM recommendation: auto");
    expect(resultsBody).toContain("default:");
    expect(resultsBody).toContain("fast:");
    expect(resultsBody).toContain("reasoning:");
    expect(resultsBody).toContain("coding:");
    expect(resultsBody).toContain("Agent routing is derived from the global preset");
    expect(resultsBody).toContain("explorer:");
    expect(resultsBody).toContain("coding:");
    expect(/Current: .* \(reasoning:/.test(resultsBody)).toBe(false);
    expect(/Default: keep the current LazyCodex\/OMO value/.test(resultsBody)).toBe(false);
    expect(/^\s*Recommended:/m.test(resultsBody)).toBe(false);
    expect(/^\s*Alternatives:/m.test(resultsBody)).toBe(false);
    expect(/Customize Core \+ ULW named agent overrides/i.test(resultsBody)).toBe(false);

    // The TUI shows its own clean "Install Summary" (not the classic printInstallPlan + Magic Word)
    expect(calls.some((c: any[]) => c[0] === "note" && /Install Summary/.test(String(c[1])))).toBe(true);
    const installSummary = calls.find((c: any[]) => c[0] === "note" && /Install Summary/.test(String(c[1])));
    expect(String(installSummary?.[2] ?? "")).toContain("Coding adapter: grok -> grok");
    expect(String(installSummary?.[2] ?? "")).toContain("Global CLI: skip");
    expect(installerMock.runLazycodexInstaller).toHaveBeenCalledWith(expect.anything(), { codingToolAdapter: "grok" });

    // Final outro from the TUI
    expect(calls.some((c: any[]) => c[0] === "outro")).toBe(true);
    const outroText = calls.filter((c: any[]) => c[0] === "outro").map((c: any[]) => String(c[1])).join("\n");
    expect(outroText).toContain("lfg --json setup --run");
    expect(outroText).not.toContain("lfg doctor");

    // If a legacy runLineSetup was supplied it may have been called (for compatibility),
    // but it is not the source of the "Setup results" content for the primary TUI path.
    // We only assert it didn't blow up.
  });

  test("runSetupTui lets setup choose pi-agent coding adapter", async () => {
    const prompts = await import("@clack/prompts") as any;
    const calls: any[] = prompts.__calls;
    calls.length = 0;
    prompts.__setCodingToolAdapterChoice("pi-agent");
    installerMock.runLazycodexInstaller.mockClear();

    await tui.runSetupTui({ codingToolAdapter: "grok" }, { plan: {}, resolved: null }, {
      prompts: prompts as any,
      colors: { inverse: (s: string) => s, green: (s: string) => s },
    });

    const adapterSelect = calls.find((c: any[]) => c[0] === "select" && /Coding tool adapter/.test(String(c[1])));
    expect(adapterSelect).toBeTruthy();
    expect(adapterSelect?.[3]).toBe("grok");
    const adapterValues = (adapterSelect?.[4] ?? []).map((option: { readonly value: string }) => option.value);
    expect(adapterValues).toEqual(["grok", "pi-agent"]);

    const installSummary = calls.find((c: any[]) => c[0] === "note" && /Install Summary/.test(String(c[1])));
    const installSummaryBody = String(installSummary?.[2] ?? "");
    expect(installSummaryBody).toContain("Coding adapter: pi-agent -> pi-agent run");
    expect(installSummaryBody).toContain("fallback: none");
    expect(installerMock.runLazycodexInstaller).toHaveBeenCalledWith(null, { codingToolAdapter: "pi-agent" });

    prompts.__setCodingToolAdapterChoice("grok");
  });

  test("runSetupTui can install the global lfg CLI after adapter setup", async () => {
    const prompts = await import("@clack/prompts") as any;
    const calls: any[] = prompts.__calls;
    calls.length = 0;
    installerMock.runLazycodexInstaller.mockClear();

    const origConfirm = prompts.confirm;
    prompts.confirm = async (opts: any) => {
      calls.push(["confirm", opts?.message]);
      if (/Install\/update the lfg CLI globally/i.test(String(opts?.message ?? ""))) return true;
      if (/Modify recommended model settings/i.test(String(opts?.message ?? ""))) return false;
      return true;
    };
    const globalInstaller = vi.fn(async () => ({
      ok: true,
      command: "npm",
      args: ["install", "--global", "@islee23520/lfg@latest"],
      stdout: "",
      stderr: "",
    }));

    const result = await tui.runSetupTui({}, { plan: {}, resolved: null }, {
      prompts: prompts as any,
      colors: { inverse: (s: string) => s, green: (s: string) => s },
      globalInstaller,
    });

    prompts.confirm = origConfirm;

    expect(result).toMatchObject({ ok: true, status: "tui_installed", executed: true });
    expect(globalInstaller).toHaveBeenCalledTimes(1);
    const installSummary = calls.find((c: any[]) => c[0] === "note" && /Install Summary/.test(String(c[1])));
    expect(String(installSummary?.[2] ?? "")).toContain("Global CLI: install/update with npm -g");
    const globalNote = calls.find((c: any[]) => c[0] === "note" && /Global CLI/.test(String(c[1])));
    expect(String(globalNote?.[2] ?? "")).toContain("npm install --global @islee23520/lfg@latest");
  });

  test("runSetupTui cancels before install when coding adapter selection is cancelled", async () => {
    const prompts = await import("@clack/prompts") as any;
    const calls: any[] = prompts.__calls;
    calls.length = 0;
    installerMock.runLazycodexInstaller.mockClear();

    const CANCEL = Symbol.for("clack-cancel");
    const origSelect = prompts.select;
    prompts.select = async (opts: any) => {
      calls.push(["select", opts?.message, opts?.options?.length, opts?.initialValue, opts?.options]);
      if (/Coding tool adapter/i.test(String(opts?.message ?? ""))) return CANCEL;
      return origSelect(opts);
    };

    await expect(
      tui.runSetupTui({}, { plan: {}, resolved: null }, {
        prompts: prompts as any,
        colors: { inverse: (s: string) => s, green: (s: string) => s },
      }),
    ).rejects.toThrow(/cancelled/);

    prompts.select = origSelect;

    expect(calls.some((c: any[]) => c[0] === "cancel")).toBe(true);
    expect(installerMock.runLazycodexInstaller).not.toHaveBeenCalled();
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
