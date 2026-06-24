import * as clack from "@clack/prompts";
import pc from "picocolors";

import { applyModelPreset, defaultLazycodexAgentConfig, withReasoningEffort, type ModelDiscovery, type ReasoningEffortChoice, type SetupPreset } from "../models/lfg-models";
import type { ModelSelector, ReasoningSelector, TierSelector } from "./lfg-setup-tui-selectors";
import { loadBundledDefaultOmoOverrides } from "../../grok/agents/lazycodex-agent-overrides";
import {
  buildVanillaGrokConfig,
  formatVanillaResults,
  formatVanillaSummary,
  readDiscoveryFromContext,
} from "./lfg-setup-tui-data";

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
      readonly modelSelector?: ModelSelector;
      readonly tierSelector?: TierSelector;
      readonly reasoningSelector?: ReasoningSelector;
    },
  ) => Promise<void>;
};

export async function runSetupTui(_args: { readonly noTui?: boolean }, context: unknown, deps: RunSetupTuiOptions = {}) {
  const prompts = deps.prompts ?? clack;
  const colors = deps.colors ?? pc;

  prompts.intro(colors.inverse(" LFG setup "));

  prompts.note(
    [
      "Install the omo/lazycodex adapter for Grok Build.",
      "Target: ~/.grok/plugins/lfg as a real directory.",
      "Codex-home bootstrap is not used.",
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

  const bundled = await loadBundledDefaultOmoOverrides();

  const modelMode = await prompts.select({
    message: "Global model preset",
    options: [
      { value: "auto", label: "Auto best available (recommended)", hint: "choose the best global routes from discovered models" },
      { value: "balanced", label: "Balanced multi-provider", hint: "GPT default, Gemini fast, Grok reasoning/coding" },
      { value: "grok", label: "Grok-specialized", hint: "Prefer Grok models for all global routes" },
      { value: "gpt", label: "GPT-centered", hint: "Prefer GPT/Codex models for default/reasoning/coding" },
      { value: "gemini", label: "Gemini-centered", hint: "Prefer Gemini for long-context exploration and summaries" },
      { value: "glm", label: "GLM-centered", hint: "Prefer GLM for default/reasoning with Grok/GPT fallback" },
      { value: "multi", label: "Provider-scoped config", hint: "Balanced routes plus provider base URLs for xAI/Gemini/GLM/GPT" },
      { value: "vanilla", label: "Vanilla Grok models", hint: "built-in Grok defaults, no proxy discovery" },
    ],
    initialValue: "auto",
  });
  if (prompts.isCancel(modelMode)) {
    prompts.cancel("lfg setup cancelled.");
    throw new Error("lfg setup cancelled");
  }

  const reasoningEffort = await prompts.select({
    message: "Global reasoning effort",
    options: [
      { value: "auto", label: "Auto from model metadata (recommended)", hint: "use proxy-advertised effort when available; otherwise role defaults" },
      { value: "low", label: "Low", hint: "fast/cheap" },
      { value: "medium", label: "Medium", hint: "balanced" },
      { value: "high", label: "High", hint: "deeper planning/review" },
      { value: "xhigh", label: "Extra high", hint: "maximum reasoning where supported" },
    ],
    initialValue: "auto",
  });
  if (prompts.isCancel(reasoningEffort)) {
    prompts.cancel("lfg setup cancelled.");
    throw new Error("lfg setup cancelled");
  }

  let configuredForInstall: ModelDiscovery | null;
  let resultsText: string;
  let modelConfigLine: string;

  if (modelMode === "vanilla") {
    const vanilla = buildVanillaGrokConfig(bundled);
    const vanillaModelIds = [...new Set([vanilla.mapping.default, vanilla.mapping.fast, vanilla.mapping.reasoning, vanilla.mapping.coding])];
    const vanillaDiscovery = withReasoningEffort({
      baseUrl: "",
      modelsUrl: "",
      modelIds: vanillaModelIds,
      mapping: vanilla.mapping,
      agentOverrideMap: vanilla.agentOverrideMap,
    }, reasoningEffort as ReasoningEffortChoice);
    configuredForInstall = vanillaDiscovery;
    resultsText = formatVanillaResults(vanilla);
    modelConfigLine = "Model config: built-in Grok defaults (no proxy)";
    prompts.note(formatVanillaSummary(vanilla), "Vanilla Grok models");
  } else {
    const baseDiscovery = readDiscoveryFromContext(context);
    const selectedPreset = modelMode as SetupPreset;
    const discovery = baseDiscovery === null ? null : withReasoningEffort(applyModelPreset(baseDiscovery, selectedPreset), reasoningEffort as ReasoningEffortChoice);
    configuredForInstall = discovery;
    resultsText = discovery === null
      ? "No model discovery was available. Installer will preserve existing model configuration."
      : formatPresetResults(selectedPreset, discovery);
    modelConfigLine = `Model config: ${selectedPreset} global preset${selectedPreset === "multi" ? " with provider-scoped base URLs" : ""}`;
  }

  prompts.note(resultsText, "Setup results");

  // TUI's own clean Install Summary (replaces the classic printInstallPlan + Magic Word box).
  prompts.note(
    [
      "Install path: grok",
      "Installer: @islee23520/lfg internal grok-install",
      modelConfigLine,
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
    prompts.outro(colors.green("No install was run. Use lfg setup --run to install, or lfg --json setup --run for scriptable verification."));
    return { ok: true, status: "tui_skipped", executed: false };
  }

  try {
    const { runLazycodexInstaller } = await import("./lfg-installer.js");
    const installRes: Record<string, unknown> = await runLazycodexInstaller(configuredForInstall);
    if (installRes?.stdout) {
      const stdout = String(installRes.stdout);
      process.stdout.write(stdout.endsWith("\n") ? stdout : `${stdout}\n`);
    }
    if (installRes?.stderr) {
      const stderr = String(installRes.stderr);
      process.stderr.write(stderr.endsWith("\n") ? stderr : `${stderr}\n`);
    }
    const success = installRes?.ok !== false;
    if (success) {
      prompts.outro(colors.green("Grok adapter installed under ~/.grok. Re-run lfg --json setup --run for scriptable verification."));
    } else {
      prompts.outro("Install completed with warnings. See output above. Re-run lfg --json setup --run to check.");
    }
    return { ok: success, status: success ? "tui_installed" : "tui_install_failed", executed: true };
  } catch (error) {
    prompts.outro("Install failed during execution. See errors above.");
    return { ok: false, status: "tui_error", error: error instanceof Error ? error.message : String(error), executed: false };
  }
}

function formatPresetResults(preset: SetupPreset, discovery: ModelDiscovery): string {
  const agents = defaultLazycodexAgentConfig(discovery);
  return [
    `Preset: ${preset}`,
    `  default: ${discovery.mapping.default}`,
    `  fast: ${discovery.mapping.fast}`,
    `  reasoning: ${discovery.mapping.reasoning}`,
    `  coding: ${discovery.mapping.coding}`,
    "",
    "Agent routing is derived from the global preset:",
    `  explorer: ${agents.explorer.model} / ${agents.explorer.reasoningLevel}`,
    `  reasoning: ${agents.reasoning.model} / ${agents.reasoning.reasoningLevel}`,
    `  coding: ${agents.coding.model} / ${agents.coding.reasoningLevel}`,
  ].join("\n");
}
