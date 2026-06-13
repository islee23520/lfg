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
  // For bare TUI setup the runner is now self-contained (Clack selects for the three roles + its own final confirm + direct installer call).
  // The classic delegation via runLineSetup is not used for the TUI bare interactive path (to guarantee zero leakage of readline guidance/gates).
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

export async function runSetupTui(args: { readonly noTui?: boolean }, context: unknown, deps: RunSetupTuiOptions = {}): Promise<any> {
  const prompts = deps.prompts ?? clack;
  const colors = deps.colors ?? pc;
  const runLineSetup = deps.runLineSetup;
  // runLineSetup is optional. The main bare TTY TUI path is self-contained (Clack selects for the
  // three roles, only clean summary lines, own Install Summary + final Clack confirm, direct installer call).
  // This guarantees zero leakage of the classic readline "Current:", "Default: keep...", "Recommended:",
  // "Alternatives:", long-tail "Configure other LazyCodex agents...?", plan review, magic word,
  // "Install now? [y/N]", "Installation cancelled...", or "oMo... Bye!" text.
  // Legacy delegation via runLineSetup is only for test shims or other callers; we do not use it
  // for the questioning phase in the primary TUI experience.

  prompts.intro(colors.inverse(" LFG setup "));

  prompts.note(
    [
      "Install the omo/lazycodex adapter for Grok Build.",
      "Target: ~/.grok/plugins/lfg as a real directory.",
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

  // TUI owns the agent configuration phase completely using the Clack selectors.
  // This guarantees that no classic readline guidance ("Current:", "Default: keep...",
  // "Recommended:", "Alternatives:", "Configure role agents?", "Configure other LazyCodex agents...?")
  // or later gates (plan review, magic word, "Install now?", cancelled, oMo bye) ever appear.
  // We only ever show clean Clack UI + the three terse role summary lines + our own Install Summary + final confirm.

  const ctx: any = context as any;
  const discovery = ctx?.resolved?.discovery ?? ctx?.plan?.modelDiscovery ?? null;

  const roleResults: Array<{ name: string; model: string; tier: string; reasoning: string }> = [];

  // Explorer
  const explorerModel = await createModelSelector(prompts)({
    agentName: "explorer",
    current: discovery?.mapping?.fast || discovery?.mapping?.default || "grok-3-mini-fast",
    choices: buildModelChoicesForTui(discovery?.modelIds || []),
  });
  const explorerTier = await createTierSelector(prompts)({ agentName: "explorer", current: "default" });
  const explorerReasoning = await createReasoningSelector(prompts)({ agentName: "explorer", current: "low" });
  roleResults.push({ name: "explorer", model: explorerModel, tier: explorerTier, reasoning: explorerReasoning });
  // The only line we emit for the transcript / results note for this agent
  console.log(`  explorer: ${explorerModel} / ${explorerReasoning} (tier: ${explorerTier})`);

  // Reasoning
  const reasoningModel = await createModelSelector(prompts)({
    agentName: "reasoning",
    current: discovery?.mapping?.reasoning || "grok-4.20-0309-reasoning",
    choices: buildModelChoicesForTui(discovery?.modelIds || []),
  });
  const reasoningTier = await createTierSelector(prompts)({ agentName: "reasoning", current: "default" });
  const reasoningReasoning = await createReasoningSelector(prompts)({ agentName: "reasoning", current: "high" });
  roleResults.push({ name: "reasoning", model: reasoningModel, tier: reasoningTier, reasoning: reasoningReasoning });
  console.log(`  reasoning: ${reasoningModel} / ${reasoningReasoning} (tier: ${reasoningTier})`);

  // Coding
  const codingModel = await createModelSelector(prompts)({
    agentName: "coding",
    current: discovery?.mapping?.coding || "gpt-5.3-codex-spark",
    choices: buildModelChoicesForTui(discovery?.modelIds || []),
  });
  const codingTier = await createTierSelector(prompts)({ agentName: "coding", current: "default" });
  const codingReasoning = await createReasoningSelector(prompts)({ agentName: "coding", current: "medium" });
  roleResults.push({ name: "coding", model: codingModel, tier: codingTier, reasoning: codingReasoning });
  console.log(`  coding: ${codingModel} / ${codingReasoning} (tier: ${codingTier})`);

  // Build a minimal configured discovery for the installer (model + reasoningLevel for the three roles).
  // The installer / grok-install side only cares about the agentConfig shape for the main roles + overrides.
  const agentConfig = {
    explorer: { model: explorerModel, reasoningLevel: explorerReasoning as any },
    reasoning: { model: reasoningModel, reasoningLevel: reasoningReasoning as any },
    coding: { model: codingModel, reasoningLevel: codingReasoning as any },
  };

  // Make the global default model reflect a user-selected value during setup.
  // Use the explorer model (high-volume default role) as the effective models.default.
  // This ensures [models].default and [lazycodex.models].default are driven by setup choices.
  const effectiveMapping = discovery?.mapping
    ? { ...discovery.mapping, default: explorerModel }
    : { default: explorerModel, fast: explorerModel, reasoning: reasoningModel, coding: codingModel };

  // For the rest of the agents we take the bundled OMO defaults (no long tail questions in TUI).
  // The runLazycodexInstaller path will resolve overrides from the global agent config / bundled.
  const configuredForInstall = discovery
    ? { ...discovery, mapping: effectiveMapping, agentConfig, agentOverrideMap: (discovery as any).agentOverrideMap }
    : { mapping: effectiveMapping, agentConfig };

  // Show the clean "Setup results" using exactly the three summary lines we just emitted.
  const resultsText = roleResults
    .map(r => `  ${r.name}: ${r.model} / ${r.reasoning} (tier: ${r.tier})`)
    .join("\n");
  prompts.note(resultsText, "Setup results");

  // TUI's own clean Install Summary (replaces the classic printInstallPlan + Magic Word box).
  prompts.note(
    [
      "Install path: grok",
      "Installer: @islee23520/lfg internal grok-install",
      "Model config: auto-mapped from /v1/models",
      "Writes: hooks, agents, overrides, lfg config, Grok plugin enablement",
      "",
      "Include ultrawork (or ulw) in your prompt to unlock deep exploration, parallel agents,",
      "background work, and relentless execution until completion.",
    ].join("\n"),
    "Install Summary"
  );

  const doInstall = await prompts.confirm({
    message: "Install now?",
    initialValue: true,
  });
  if (prompts.isCancel(doInstall) || doInstall !== true) {
    prompts.cancel("lfg setup cancelled.");
    prompts.outro(colors.green("Grok adapter ready under ~/.grok. Run lfg doctor to verify anytime."));
    return { ok: true, status: "tui_skipped", executed: false };
  }

  // Perform the actual Grok materialization.
  try {
    const { runLazycodexInstaller } = await import("./lfg-installer.js");
    // Pass the resolved agent overrides so the installer writes [lazycodex.agents.*] for ALL agents
    // (roles + LFP/omo imported + flavour-pack). The installer forwards fullAgentModels to writeGrokModelConfig.
    const installRes: any = await runLazycodexInstaller(configuredForInstall as any);
    if (installRes?.stdout) {
      process.stdout.write(installRes.stdout.endsWith("\n") ? installRes.stdout : installRes.stdout + "\n");
    }
    if (installRes?.stderr) {
      process.stderr.write(installRes.stderr.endsWith("\n") ? installRes.stderr : installRes.stderr + "\n");
    }
    const success = installRes?.ok !== false;
    if (success) {
      prompts.outro(colors.green("Grok adapter installed under ~/.grok. Run lfg doctor to verify anytime."));
    } else {
      prompts.outro("Install completed with warnings. See output above. Run lfg doctor to check.");
    }
    return { ok: success, status: success ? "tui_installed" : "tui_install_failed", executed: true };
  } catch (e: any) {
    prompts.outro("Install failed during execution. See errors above.");
    return { ok: false, status: "tui_error", error: String(e?.message || e), executed: false };
  }
}

// Small helper so the TUI can build choice lists for the model selects (must match the shape expected by the selector factories and the wizard).
function buildModelChoicesForTui(models: readonly string[]) {
  const groups = new Map<string, string[]>();
  for (const m of models) {
    const key = m.split("/").at(-1) ?? m;
    const arr = groups.get(key) ?? [];
    arr.push(m);
    groups.set(key, arr);
  }
  return [...groups.entries()].map(([key, aliases]) => {
    const unique = [...new Set(aliases)].sort((a, b) => a.localeCompare(b));
    const value = unique.find((a) => a === key) ?? unique.find((a) => a === `openai/${key}`) ?? unique[0];
    const label = unique.length === 1 ? unique[0] : `${key} (aliases: ${unique.join(", ")})`;
    return { key, aliases: unique, value, label };
  });
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
