import * as clack from "@clack/prompts";
import pc from "picocolors";

import { applyModelPreset, defaultLazycodexAgentConfig, withReasoningEffort, type ModelDiscovery, type ReasoningEffortChoice, type SetupPreset } from "../models/lfg-models";
import type { ModelSelector, ReasoningSelector, TierSelector } from "./lfg-setup-tui-selectors";
import { loadBundledDefaultOmoOverrides } from "../../grok/agents/lazycodex-agent-overrides";
import {
  buildVanillaGrokConfig,
  buildVanillaGrokDiscovery,
  formatVanillaResults,
  formatVanillaSummary,
  readDiscoveryFromContext,
  toRecommendationOverrideMap,
} from "./lfg-setup-tui-data";
import { createSetupSelectors, buildModelChoicesForTui, type ModelChoice } from "./lfg-setup-tui-selectors";
import { configureAgentOverrides, configureRoleAgents } from "./lfg-setup-tui-agents";
import { DEFAULT_CODING_TOOL_ADAPTER, isCodingToolAdapterId, type CodingToolAdapterId } from "../../shared/coding-tool-adapter";
import { codingToolAdapterTuiOptions } from "./lfg-setup-tui-adapter";
import { executeTuiInstall, type TuiGlobalInstaller } from "./lfg-setup-tui-execute";
import { formatCustomResults, formatInstallSummary, formatIntroNote, formatPresetResults, formatRecommendedResults } from "./lfg-setup-tui-results";

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
  readonly globalInstaller?: TuiGlobalInstaller;
};

export async function runSetupTui(args: { readonly noTui?: boolean; readonly codingToolAdapter?: CodingToolAdapterId }, context: unknown, deps: RunSetupTuiOptions = {}) {
  const prompts = deps.prompts ?? clack;
  const colors = deps.colors ?? pc;

  const configOnly = isConfigOnlyContext(context);
  prompts.intro(colors.inverse(configOnly ? " LFG model config " : " LFG setup "));

  prompts.note(
    formatIntroNote(configOnly),
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

  const adapterChoice = await prompts.select({
    message: "Coding tool adapter",
    options: [...codingToolAdapterTuiOptions()],
    initialValue: args.codingToolAdapter ?? DEFAULT_CODING_TOOL_ADAPTER,
  });
  if (prompts.isCancel(adapterChoice) || !isCodingToolAdapterId(adapterChoice)) {
    prompts.cancel("lfg setup cancelled.");
    throw new Error("lfg setup cancelled");
  }

  // Explicit opt-in for OpenAI-compatible CLI proxy; default is vanilla Grok Build auth.
  const wantsProxy = await prompts.confirm({
    message: "Use OpenAI-compatible CLI proxy for model routing? (default: no = vanilla Grok Build auth)",
    initialValue: false,
  });
  if (prompts.isCancel(wantsProxy)) {
    prompts.cancel("lfg setup cancelled.");
    throw new Error("lfg setup cancelled");
  }

  const bundled = await loadBundledDefaultOmoOverrides();
  const baseDiscovery = wantsProxy ? readDiscoveryFromContext(context) : null;

  let configuredForInstall: ModelDiscovery | null = null;
  let resultsText = "No model discovery was available. Installer will preserve existing model configuration.";
  let modelConfigLine = "Model config: preserved existing settings";
  let shouldUseManualFlow = wantsProxy === true;

  if (wantsProxy !== true) {
    // Vanilla mode now uses real discovery (with OAuth) for best native Grok models (grok-4/grok-3)
    const vanilla = buildVanillaGrokConfig(bundled, baseDiscovery || undefined);
    configuredForInstall = buildVanillaGrokDiscovery(bundled, baseDiscovery || undefined);
    resultsText = formatVanillaResults(vanilla);
    modelConfigLine = "Model config: native Grok models via OAuth (dynamic selection)";
    prompts.note(formatVanillaSummary(vanilla), "Vanilla Grok models (optimized)");
  }

  if (baseDiscovery !== null && baseDiscovery.modelIds.length > 0) {
    const wantsRecommendations = await prompts.confirm({
      message: "Use LLM recommendations from your available models?",
      initialValue: true,
    });
    if (prompts.isCancel(wantsRecommendations)) {
      prompts.cancel("lfg setup cancelled.");
      throw new Error("lfg setup cancelled");
    }
    if (wantsRecommendations === true) {
      const recommendedDiscovery = withReasoningEffort(applyModelPreset(baseDiscovery, "auto"), "auto");
      prompts.note(formatRecommendedResults(recommendedDiscovery, bundled), "LLM recommendations");
      const wantsModify = await prompts.confirm({
        message: "Modify recommended model settings?",
        initialValue: false,
      });
      if (prompts.isCancel(wantsModify)) {
        prompts.cancel("lfg setup cancelled.");
        throw new Error("lfg setup cancelled");
      }
      if (wantsModify !== true) {
        configuredForInstall = recommendedDiscovery;
        resultsText = formatRecommendedResults(recommendedDiscovery, bundled);
        modelConfigLine = "Model config: LLM recommendation from discovered models";
        shouldUseManualFlow = false;
      }
    }
  }

  if (shouldUseManualFlow) {
    const modelMode = await prompts.select({
      message: "Global model preset",
      options: [
        { value: "auto", label: "Auto best available (recommended)", hint: "GrokBuild orchestration, GLM fast, Composer coding when available" },
        { value: "balanced", label: "Balanced multi-provider", hint: "GPT default, Gemini fast, Grok reasoning/coding" },
        { value: "grok", label: "Grok-specialized", hint: "Prefer Grok models for all global routes" },
        { value: "gpt", label: "GPT-centered", hint: "Prefer GPT for default/reasoning while keeping coding on recommended agent routes" },
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

    if (modelMode === "vanilla") {
      // Optimized vanilla: use discovery if available (OAuth provides real model list)
      const vanilla = buildVanillaGrokConfig(bundled, baseDiscovery || undefined);
      configuredForInstall = buildVanillaGrokDiscovery(bundled, baseDiscovery || undefined, reasoningEffort as ReasoningEffortChoice);
      resultsText = formatVanillaResults(vanilla);
      modelConfigLine = "Model config: native Grok models via OAuth (dynamic selection)";
      prompts.note(formatVanillaSummary(vanilla), "Vanilla Grok models (optimized)");
    } else {
      const selectedPreset = modelMode as SetupPreset;
      const discovery = baseDiscovery === null ? null : withReasoningEffort(applyModelPreset(baseDiscovery, selectedPreset), reasoningEffort as ReasoningEffortChoice);

      // Offer per-role customization when we have discovered models to choose from.
      if (discovery !== null && discovery.modelIds.length > 0) {
        const customMode = await prompts.select({
          message: "Model customization",
          options: [
            { value: "none", label: "Use auto routing (recommended)", hint: "GrokBuild orchestration, GLM fast, Composer coding when available" },
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
  }

  prompts.note(resultsText, "Setup results");

  const installGlobalCli = configOnly ? false : await prompts.confirm({
    message: "Install/update the lfg CLI globally with npm? (enables the lfg command)",
    initialValue: false,
  });
  if (prompts.isCancel(installGlobalCli)) {
    prompts.cancel("lfg setup cancelled.");
    throw new Error("lfg setup cancelled");
  }

  // TUI's own clean Install Summary (replaces the classic printInstallPlan + Magic Word box).
  prompts.note(
    formatInstallSummary({ configOnly, adapterChoice, installGlobalCli: installGlobalCli === true, modelConfigLine }),
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

  return executeTuiInstall({
    prompts,
    colors,
    configuredForInstall,
    codingToolAdapter: adapterChoice,
    configOnly,
    installGlobalCli: installGlobalCli === true,
    ...(deps.globalInstaller === undefined ? {} : { globalInstaller: deps.globalInstaller }),
  });
}

function isConfigOnlyContext(context: unknown): boolean {
  return typeof context === "object" && context !== null && "configOnly" in context && (context as { readonly configOnly?: unknown }).configOnly === true;
}
