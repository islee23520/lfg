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
  toRecommendationOverrideMap,
} from "./lfg-setup-tui-data";
import { createSetupSelectors, buildModelChoicesForTui, type ModelChoice } from "./lfg-setup-tui-selectors";
import { configureAgentOverrides, configureRoleAgents, type AgentTuiResult } from "./lfg-setup-tui-agents";

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

  const configOnly = isConfigOnlyContext(context);
  prompts.intro(colors.inverse(configOnly ? " LFG model config " : " LFG setup "));

  prompts.note(
    configOnly
      ? [
          "Edit LFG model routing from discovered proxy models.",
          "Auto routing prefers GPT/GLM for orchestration, Composer for coding, and Gemini for visual agents.",
          "Saving re-runs the idempotent Grok adapter sync so settings land in ~/.grok.",
        ].join("\n")
      : [
          "Install the omo/lazycodex adapter for Grok Build.",
          "Target: ~/.grok/plugins/lfg as a real directory.",
          "Codex-home bootstrap is not used.",
          "Apply Grok adapter, hooks, agents, and model overrides from discovered proxy."
        ].join("\n"),
    configOnly ? "Model routing editor" : "Grok adapter overlay"
  );

  const proceed = await prompts.confirm({
    message: configOnly ? "Continue to model routing editor?" : "Continue with lfg setup?",
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
      { value: "auto", label: "Auto best available (recommended)", hint: "GPT/GLM orchestration, Composer coding, Gemini visual" },
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
      { value: "auto", label: "Auto (role defaults: low/medium/high) (recommended)", hint: "explorer=low, coding=medium, reasoning=high" },
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

    // Offer per-role customization when we have discovered models to choose from.
    if (discovery !== null && discovery.modelIds.length > 0) {
      const customMode = await prompts.select({
        message: "Model customization",
        options: [
          { value: "none", label: "Use auto routing (recommended)", hint: "GPT/GLM orchestration, Composer coding, Gemini visual" },
          { value: "roles", label: "Customize core roles", hint: "edit explorer / reasoning / coding" },
          { value: "all", label: "Customize all named agents", hint: "edit core roles and every OMO/ULW override" },
        ],
        initialValue: "none",
      });
      if (prompts.isCancel(customMode)) {
        prompts.cancel("lfg setup cancelled.");
        throw new Error("lfg setup cancelled");
      }
      if (customMode === "roles" || customMode === "all") {
        const choices = buildModelChoicesForTui(discovery.modelIds);
        const selectors = createSetupSelectors(prompts);
        const roleResults = await configureRoleAgents(prompts, discovery, choices, selectors, bundled);
        const explorerModel = roleResults.find((r) => r.name === "explorer")?.model ?? discovery.mapping.fast;
        const reasoningModel = roleResults.find((r) => r.name === "reasoning")?.model ?? discovery.mapping.reasoning;
        const codingModel = roleResults.find((r) => r.name === "coding")?.model ?? discovery.mapping.coding;
        const customDiscovery = {
          ...discovery,
          mapping: {
            ...discovery.mapping,
            fast: explorerModel,
            reasoning: reasoningModel,
            coding: codingModel,
          },
        };
        const agents = defaultLazycodexAgentConfig(customDiscovery);
        if (customMode === "all") {
          const overrideResult = await configureAgentOverrides(prompts, customDiscovery, choices, selectors, roleResults, agents, bundled, toRecommendationOverrideMap(bundled));
          configuredForInstall = { ...customDiscovery, agentConfig: agents, agentOverrideMap: overrideResult.agentOverrideMap };
          resultsText = formatCustomResults(selectedPreset, configuredForInstall, roleResults, agents, overrideResult.extraResults);
          modelConfigLine = `Model config: ${selectedPreset} preset (customized all named agents)`;
        } else {
          configuredForInstall = { ...customDiscovery, agentConfig: agents };
          resultsText = formatCustomResults(selectedPreset, configuredForInstall, roleResults, agents);
          modelConfigLine = `Model config: ${selectedPreset} preset (customized roles)`;
        }
      } else {
        configuredForInstall = discovery;
        resultsText = discovery === null
          ? "No model discovery was available. Installer will preserve existing model configuration."
          : formatPresetResults(selectedPreset, discovery);
        modelConfigLine = `Model config: ${selectedPreset} global preset${selectedPreset === "multi" ? " with provider-scoped base URLs" : ""}`;
      }
    } else {
      configuredForInstall = discovery;
      resultsText = discovery === null
        ? "No model discovery was available. Installer will preserve existing model configuration."
        : formatPresetResults(selectedPreset, discovery);
      modelConfigLine = `Model config: ${selectedPreset} global preset${selectedPreset === "multi" ? " with provider-scoped base URLs" : ""}`;
    }
  }

  prompts.note(resultsText, "Setup results");

  // TUI's own clean Install Summary (replaces the classic printInstallPlan + Magic Word box).
  prompts.note(
    [
      configOnly ? "Config path: ~/.grok" : "Install path: grok",
      configOnly ? "Updater: idempotent lfg Grok config sync" : "Installer: @islee23520/lfg internal grok-install",
      modelConfigLine,
      "Writes: hooks, agents, overrides, lfg config, Grok plugin enablement",
      "",
      "Include ultrawork (or ulw) in your prompt to unlock deep exploration, parallel agents,",
      "background work, and relentless execution until completion.",
    ].join("\n"),
    "Install Summary"
  );

  const doInstall = await prompts.confirm({
    message: configOnly ? "Save model routing now?" : "Install now?",
    initialValue: true,
  });
  if (prompts.isCancel(doInstall) || doInstall !== true) {
    prompts.cancel("lfg setup cancelled.");
    prompts.outro(colors.green(configOnly ? "No model config changes were saved." : "No install was run. Use lfg setup --run to install, or lfg --json setup --run for scriptable verification."));
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
      prompts.outro(colors.green(configOnly ? "LFG model routing saved under ~/.grok." : "Grok adapter installed under ~/.grok. Re-run lfg --json setup --run for scriptable verification."));
    } else {
      prompts.outro("Install completed with warnings. See output above. Re-run lfg --json setup --run to check.");
    }
    return { ok: success, status: success ? (configOnly ? "tui_config_saved" : "tui_installed") : "tui_install_failed", executed: true };
  } catch (error) {
    prompts.outro("Install failed during execution. See errors above.");
    return { ok: false, status: "tui_error", error: error instanceof Error ? error.message : String(error), executed: false };
  }
}

function isConfigOnlyContext(context: unknown): boolean {
  return typeof context === "object" && context !== null && "configOnly" in context && (context as { readonly configOnly?: unknown }).configOnly === true;
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
function formatCustomResults(
  preset: SetupPreset,
  discovery: ModelDiscovery,
  roleResults: readonly AgentTuiResult[],
  agents: ReturnType<typeof defaultLazycodexAgentConfig>,
  extraResults: readonly AgentTuiResult[] = [],
): string {
  const extraLines = extraResults.length === 0
    ? []
    : ["", "Named agent overrides (customized):", ...extraResults.map((agent) => `  ${agent.name}: ${agent.model} / ${agent.reasoning} (tier: ${agent.tier})`)];
  return [
    `Preset: ${preset} (customized roles)`,
    `  default: ${discovery.mapping.default}`,
    `  fast: ${discovery.mapping.fast}`,
    `  reasoning: ${discovery.mapping.reasoning}`,
    `  coding: ${discovery.mapping.coding}`,
    "",
    "Agent routing (customized):",
    `  explorer: ${agents.explorer.model} / ${agents.explorer.reasoningLevel}`,
    `  reasoning: ${agents.reasoning.model} / ${agents.reasoning.reasoningLevel}`,
    `  coding: ${agents.coding.model} / ${agents.coding.reasoningLevel}`,
    ...extraLines,
  ].join("\n");
}
