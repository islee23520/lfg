import * as clack from "@clack/prompts";
import pc from "picocolors";

import { applyModelPreset, defaultLazycodexAgentConfig, withReasoningEffort, type ModelDiscovery, type ReasoningEffortChoice, type SetupPreset } from "../models/lfg-models";
import type { ModelSelector, ReasoningSelector, TierSelector } from "./lfg-setup-tui-selectors";
import { loadBundledDefaultOmoOverrides } from "../../grok/agents/lazycodex-agent-overrides";
import {
  buildVanillaGrokDiscovery,
  readDiscoveryFromContext,
  toRecommendationOverrideMap,
} from "./lfg-setup-tui-data";
import { createSetupSelectors, buildModelChoicesForTui, type ModelChoice } from "./lfg-setup-tui-selectors";
import { configureAgentOverrides, configureRoleAgents } from "./lfg-setup-tui-agents";
import { DEFAULT_CODING_TOOL_ADAPTER, isCodingToolAdapterId, type CodingToolAdapterId } from "../../shared/coding-tool-adapter";
import { executeTuiInstall, type TuiGlobalInstaller } from "./lfg-setup-tui-execute";
import { formatInstallSummary, formatIntroNote, formatPresetResults, formatRecommendedResults } from "./lfg-setup-tui-results";
import type { CliBackend } from "../../core/lfg/backend-routing";
import { fixedBackendRouting } from "./lfg-setup-tui-backends";
import { ensureCodexLazyCodexPrereqsInTui } from "./lfg-setup-tui-prereqs";

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
  readonly ensurePrereqs?: typeof ensureCodexLazyCodexPrereqsInTui;
};

export async function runSetupTui(args: { readonly noTui?: boolean; readonly codingToolAdapter?: CodingToolAdapterId; readonly backendEngine?: CliBackend; readonly backendEngineExplicit?: boolean }, context: unknown, deps: RunSetupTuiOptions = {}) {
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

  if (!configOnly) {
    const ensurePrereqs = deps.ensurePrereqs ?? ensureCodexLazyCodexPrereqsInTui;
    const prereqResult = await ensurePrereqs({
      prompts: {
        note: prompts.note,
        confirm: prompts.confirm,
        select: (options) => prompts.select({ ...options, options: [...options.options] }),
        isCancel: prompts.isCancel,
        cancel: prompts.cancel,
        ...optionalClackExtras(prompts),
      },
    });
    if (!prereqResult.ok) {
      throw new Error(
        prereqResult.status === "cancelled"
          ? "lfg setup cancelled"
          : "Codex CLI is required before lfg setup",
      );
    }
  }

  // Adapter is CLI-flag only (`--coding-tool-adapter`); do not ask during install.
  const adapterChoice = args.codingToolAdapter ?? DEFAULT_CODING_TOOL_ADAPTER;
  if (!isCodingToolAdapterId(adapterChoice)) {
    prompts.cancel("lfg setup cancelled.");
    throw new Error("lfg setup cancelled");
  }

  // Product is fixed: Sisyphus on Grok, implementer on Codex App — no setup quiz.
  const backendRouting = fixedBackendRouting(
    args.backendEngineExplicit === true ? args.backendEngine : undefined,
  );

  // Vanilla Grok is the default. Proxy / multi-provider discovery is opt-in only via
  // explicit `--base-url` (or a resolved discovery with a non-empty base URL). No install-time proxy quiz.
  const bundled = await loadBundledDefaultOmoOverrides();
  const contextDiscovery = readDiscoveryFromContext(context);
  const hasProxyDiscovery =
    contextDiscovery !== null &&
    typeof contextDiscovery.baseUrl === "string" &&
    contextDiscovery.baseUrl.trim().length > 0 &&
    contextDiscovery.modelIds.length > 0;
  const baseDiscovery = hasProxyDiscovery ? contextDiscovery : null;

  let configuredForInstall: ModelDiscovery | null = null;
  let resultsText = "No model discovery was available. Installer will preserve existing model configuration.";
  let modelConfigLine = "Model config: preserved existing settings";
  let shouldUseManualFlow = hasProxyDiscovery;

  if (!hasProxyDiscovery) {
    // Vanilla Grok Build auth — no model-map dump in the wizard (setup does not rewrite fat [model.*]).
    configuredForInstall = buildVanillaGrokDiscovery(bundled, undefined);
    resultsText = "Vanilla Grok host defaults will be preserved; no model tables will be written.";
    modelConfigLine = "Model config: host Grok defaults (untouched; no model-table rewrite)";
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
        { value: "auto", label: "Automatic routing (recommended)", hint: "Choose routes from discovered models" },
        { value: "grok", label: "Grok-specialized", hint: "Prefer Grok models for all global routes" },
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
        { value: "xhigh", label: "Extra high", hint: "use the model's extra-high reasoning setting" },
      ],
      initialValue: "auto",
    });
    if (prompts.isCancel(reasoningEffort)) {
      prompts.cancel("lfg setup cancelled.");
      throw new Error("lfg setup cancelled");
    }

    if (modelMode === "vanilla") {
      configuredForInstall = buildVanillaGrokDiscovery(bundled, baseDiscovery || undefined, reasoningEffort as ReasoningEffortChoice);
      resultsText = "Vanilla Grok host defaults will be preserved; no model tables will be written.";
      modelConfigLine = "Model config: host Grok defaults (untouched)";
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
            resultsText = formatPresetResults(selectedPreset, customDiscovery);
            modelConfigLine = `Model config: ${selectedPreset} preset (customized all named agents)`;
          } else {
            configuredForInstall = { ...customDiscovery, agentConfig: agents };
            resultsText = formatPresetResults(selectedPreset, customDiscovery);
            modelConfigLine = `Model config: ${selectedPreset} preset (customized roles)`;
          }
        } else {
          configuredForInstall = discovery;
          resultsText = formatPresetResults(selectedPreset, discovery);
          modelConfigLine = `Model config: ${selectedPreset} global preset`;
        }
      } else {
        configuredForInstall = discovery;
        resultsText = discovery === null ? resultsText : formatPresetResults(selectedPreset, discovery);
        modelConfigLine = `Model config: ${selectedPreset} global preset`;
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
    formatInstallSummary({
      configOnly,
      adapterChoice,
      installGlobalCli: installGlobalCli === true,
      modelConfigLine,
      backendRouting,
    }),
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
    backendRouting,
    configOnly,
    installGlobalCli: installGlobalCli === true,
    ...(deps.globalInstaller === undefined ? {} : { globalInstaller: deps.globalInstaller }),
  });
}

function isConfigOnlyContext(context: unknown): boolean {
  return typeof context === "object" && context !== null && "configOnly" in context && (context as { readonly configOnly?: unknown }).configOnly === true;
}

/** Safe optional Clack extras (spinner/log) — vitest module mocks throw on missing named exports. */
function optionalClackExtras(prompts: typeof clack): {
  readonly spinner?: () => { start: (message?: string) => void; message: (message?: string) => void; stop: (message?: string) => void }
  readonly log?: { step?: (message: string) => void; info?: (message: string) => void; success?: (message: string) => void; warn?: (message: string) => void }
} {
  const spinner = tryGetProp(prompts, "spinner")
  const log = tryGetProp(prompts, "log")
  return {
    ...(typeof spinner === "function"
      ? {
          spinner: spinner as () => {
            start: (message?: string) => void
            message: (message?: string) => void
            stop: (message?: string) => void
          },
        }
      : {}),
    ...(typeof log === "object" && log !== null
      ? { log: log as { step?: (message: string) => void; info?: (message: string) => void; success?: (message: string) => void; warn?: (message: string) => void } }
      : {}),
  }
}

function tryGetProp(target: unknown, key: string): unknown {
  try {
    if (target === null || target === undefined) return undefined
    return (target as Record<string, unknown>)[key]
  } catch {
    return undefined
  }
}
