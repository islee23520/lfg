import * as clack from "@clack/prompts";
import pc from "picocolors";

import { applyModelPreset, type LazycodexAgentConfig, type ModelDiscovery } from "./lfg-models";
import { buildModelChoicesForTui, createSetupSelectors, type ModelSelector, type ReasoningSelector, type TierSelector } from "./lfg-setup-tui-selectors";
import { loadBundledDefaultOmoOverrides } from "../grok-adapter/lazycodex-agent-overrides";
import {
  buildVanillaGrokConfig,
  formatVanillaResults,
  formatVanillaSummary,
  readDiscoveryFromContext,
  toRecommendationOverrideMap,
} from "./lfg-setup-tui-data";
import { configureAgentOverrides, configureRoleAgents, resolveFastMappingSlot } from "./lfg-setup-tui-agents";
import { formatRecommendationTable } from "../grok-adapter/model-recommendations";

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

  // Ask how to source models. This is fundamentally a Grok plugin, so "Vanilla Grok models"
  // (no proxy, no per-agent selection) is the default. Choosing cli-proxy keeps the prior
  // discovery-based model-selection flow.
  const modelMode = await prompts.select({
    message: "Model setup",
    options: [
      { value: "vanilla", label: "Vanilla Grok models (recommended)", hint: "built-in Grok defaults, no proxy" },
      { value: "proxy", label: "Set up cli-proxy / model provider", hint: "discover models from proxy" },
      { value: "multi", label: "Multi-provider preset", hint: "GJC-style provider grouping, Grok setup remains default-safe" },
    ],
    initialValue: "vanilla",
  });
  if (prompts.isCancel(modelMode)) {
    prompts.cancel("lfg setup cancelled.");
    throw new Error("lfg setup cancelled");
  }

  let configuredForInstall: ModelDiscovery | null;
  let resultsText: string;
  let modelConfigLine: string;

  if (modelMode === "proxy" || modelMode === "multi") {
    const baseDiscovery = readDiscoveryFromContext(context);
    const discovery = modelMode === "multi" && baseDiscovery !== null ? applyModelPreset(baseDiscovery, "multi") : baseDiscovery;
    const choices = buildModelChoicesForTui(discovery?.modelIds ?? []);
    const selectors = createSetupSelectors(prompts);
    const bundledRecommendationOverrides = toRecommendationOverrideMap(bundled);
    prompts.note(formatRecommendationTable(discovery?.modelIds ?? [], bundledRecommendationOverrides, { condensed: true }), "Model recommendations");
    const roleResults = await configureRoleAgents(prompts, discovery, choices, selectors, bundledRecommendationOverrides);
    const agentConfig = {
      explorer: { model: roleResults[0].model, reasoningLevel: roleResults[0].reasoning },
      reasoning: { model: roleResults[1].model, reasoningLevel: roleResults[1].reasoning },
      coding: { model: roleResults[2].model, reasoningLevel: roleResults[2].reasoning },
    } satisfies LazycodexAgentConfig;
    const agentOverrides = await configureAgentOverrides(prompts, discovery, choices, selectors, roleResults, agentConfig, bundled, bundledRecommendationOverrides);
    const explorerModel = agentConfig.explorer.model;
    const effectiveMapping = discovery?.mapping
      ? { ...discovery.mapping, default: agentOverrides.agentOverrideMap.sisyphus?.model ?? explorerModel, fast: resolveFastMappingSlot(discovery, roleResults, explorerModel) }
      : { default: agentOverrides.agentOverrideMap.sisyphus?.model ?? explorerModel, fast: explorerModel, reasoning: agentConfig.reasoning.model, coding: agentConfig.coding.model };
    configuredForInstall = discovery
      ? { ...discovery, mapping: effectiveMapping, agentConfig, agentOverrideMap: agentOverrides.agentOverrideMap }
      : null;
    resultsText = [...roleResults, ...agentOverrides.extraResults]
      .map(r => `  ${r.name}: ${r.model} / ${r.reasoning} (tier: ${r.tier})`)
      .join("\n");
    modelConfigLine = modelMode === "multi" ? "Model config: multi-provider preset from /v1/models" : "Model config: auto-mapped from /v1/models";
  } else {
    // Vanilla Grok fast path: skip discovery and per-agent selection; use bundled Grok-first defaults.
    const vanilla = buildVanillaGrokConfig(bundled);
    const vanillaModelIds = [...new Set([vanilla.mapping.default, vanilla.mapping.fast, vanilla.mapping.reasoning, vanilla.mapping.coding])];
    configuredForInstall = {
      baseUrl: "",
      modelsUrl: "",
      modelIds: vanillaModelIds,
      mapping: vanilla.mapping,
      agentConfig: vanilla.agentConfig,
      agentOverrideMap: vanilla.agentOverrideMap,
    };
    resultsText = formatVanillaResults(vanilla);
    modelConfigLine = "Model config: built-in Grok defaults (no proxy)";
    prompts.note(formatVanillaSummary(vanilla), "Vanilla Grok models");
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
