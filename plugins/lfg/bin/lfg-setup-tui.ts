import * as clack from "@clack/prompts";
import pc from "picocolors";

import { INTERNAL_GROK_INSTALL_COMMAND } from "../grok-install/run-grok-install";

// LFP-style tiers and reasoning efforts for selector factories (Grok path supports reasoningLevel;
// tier is accepted for UX parity even if the underlying agent config primarily persists model+reasoningLevel).
export const SERVICE_TIERS = [
  { value: "default", label: "default (non-fast)" },
  { value: "fast", label: "fast" },
];

export const REASONING_EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;

export function shouldUseSetupTui(args: { readonly noTui?: boolean }, options: { readonly check?: boolean; readonly input?: { readonly isTTY?: boolean }; readonly output?: { readonly isTTY?: boolean } }): boolean {
  if (options.check || args.noTui === true) return false;
  return options.input?.isTTY === true && options.output?.isTTY === true;
}

export type RunSetupTuiOptions = {
  readonly prompts?: typeof clack;
  readonly colors?: { readonly inverse: (v: string) => string; readonly green: (v: string) => string };
  readonly runLineSetup?: (
    args: { readonly noTui: true },
    context: unknown,
    deps?: {
      readonly modelSelector?: (spec: { agentName?: string; current: string; choices: Array<{ value: string; label: string; aliases: readonly string[]; key: string }> }) => Promise<string>;
      readonly tierSelector?: (spec: { agentName?: string; current: string }) => Promise<string>;
      readonly reasoningSelector?: (spec: { agentName?: string; current: string }) => Promise<string>;
    },
  ) => Promise<void>;
};

export async function runSetupTui(args: { readonly noTui?: boolean }, context: unknown, deps: RunSetupTuiOptions = {}): Promise<void> {
  const prompts = deps.prompts ?? clack;
  const colors = deps.colors ?? pc;
  const runLineSetup = deps.runLineSetup;
  if (runLineSetup === undefined) throw new Error("runSetupTui requires runLineSetup");

  prompts.intro(colors.inverse(" LFG setup "));

  prompts.note(
    [
      "Install the omo/lazycodex adapter for Grok Build.",
      "Target: ~/.grok/installed-plugins/lfg as a real directory.",
      "Codex-side npx lazycodex-ai install is not used.",
      "Apply Grok adapter, hooks, agents, and model overrides from discovered proxy."
    ].join("\n"),
    "Grok adapter overlay"
  );

  const proceed = await prompts.confirm({
    message: "Continue with lfg setup?",
    initialValue: true,
  });
  if (prompts.isCancel(proceed) || proceed !== true) {
    prompts.cancel("lfg setup cancelled.");
    throw new Error("lfg setup cancelled");
  }

  const capturedOutput: string[] = [];
  const restoreConsole = captureConsoleOutput(capturedOutput);
  try {
    await runLineSetup({ ...args, noTui: true }, context, {
      modelSelector: createModelSelector(prompts),
      tierSelector: createTierSelector(prompts),
      reasoningSelector: createReasoningSelector(prompts),
    });
  } catch (error) {
    throw error;
  } finally {
    restoreConsole();
  }

  if (capturedOutput.length > 0) {
    prompts.note(capturedOutput.join("\n"), "Setup results");
  }
  prompts.outro(colors.green("Grok adapter ready under ~/.grok. Run lfg doctor to verify anytime."));
}

function createModelSelector(prompts: typeof clack) {
  return async ({ agentName, current, choices }: { agentName?: string; current: string; choices: Array<{ value: string; label: string; aliases: readonly string[]; key: string }> }): Promise<string> => {
    const options = buildModelOptions(current, choices);
    const selected = await prompts.select({
      message: agentName ? `${agentName} model` : "Model",
      options,
      initialValue: options.find((o) => o.value === current)?.value ?? options[0]?.value,
    });
    if (prompts.isCancel(selected)) {
      prompts.cancel("lfg setup cancelled.");
      throw new Error("lfg setup cancelled");
    }
    return selected as string;
  };
}

function buildModelOptions(current: string, choices: Array<{ value: string; label: string; aliases: readonly string[]; key: string }>) {
  const options = choices.map((choice) => ({
    value: choice.value,
    label: choice.label,
    hint: choice.aliases.includes(current) || choice.key === current ? "current" : undefined,
  }));
  if (options.some((o) => o.value === current)) return options;
  return [{ value: current, label: current, hint: "current custom id" }, ...options];
}

function captureConsoleOutput(lines: string[]) {
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...values: unknown[]) => lines.push(values.map(String).join(" "));
  console.error = (...values: unknown[]) => lines.push(values.map(String).join(" "));
  return () => {
    console.log = originalLog;
    console.error = originalError;
  };
}

function createTierSelector(prompts: typeof clack) {
  return async ({ agentName, current }: { agentName?: string; current: string }): Promise<string> => {
    const options = SERVICE_TIERS.map((tier) => ({
      value: tier.value,
      label: tier.label,
      hint: tier.value === current ? "current" : undefined,
    }));
    const selected = await prompts.select({
      message: agentName ? `${agentName} service tier` : "Service tier",
      options,
      initialValue: current,
    });
    if (prompts.isCancel(selected)) {
      prompts.cancel("lfg setup cancelled.");
      throw new Error("lfg setup cancelled");
    }
    return selected as string;
  };
}

function createReasoningSelector(prompts: typeof clack) {
  return async ({ agentName, current }: { agentName?: string; current: string }): Promise<string> => {
    const options = REASONING_EFFORTS.map((effort) => ({
      value: effort,
      label: effort,
      hint: effort === current ? "current" : undefined,
    }));
    const selected = await prompts.select({
      message: agentName ? `${agentName} reasoning effort` : "Reasoning effort",
      options,
      initialValue: current,
    });
    if (prompts.isCancel(selected)) {
      prompts.cancel("lfg setup cancelled.");
      throw new Error("lfg setup cancelled");
    }
    return selected as string;
  };
}
