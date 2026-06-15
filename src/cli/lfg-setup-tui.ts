import * as clack from "@clack/prompts";
import pc from "picocolors";

import { isRecord } from "./lfg-json";
import type { LazycodexAgentConfig, ModelDiscovery, ReasoningLevel } from "./lfg-models";
import {
  buildModelChoicesForTui,
  createSetupSelectors,
  type ModelChoice,
  type ModelSelector,
  type ReasoningSelector,
  type TierSelector,
} from "./lfg-setup-tui-selectors";
import {
  CONFIGURABLE_LAZYCODEX_AGENT_NAMES,
  loadBundledDefaultOmoOverrides,
  mergeLazycodexAgentOverrides,
  type LazycodexAgentModelOverride,
  type LazycodexAgentOverrideMap,
} from "../grok-adapter/lazycodex-agent-overrides";
import { INTERNAL_GROK_INSTALL_COMMAND } from "../grok-adapter/run-grok-install";
import {
  defaultTierPromptForAgent,
  resolveModelForServiceTier,
  serviceTierFromChoice,
} from "./resolve-tier-model";

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

type AgentTuiResult = {
  readonly name: string
  readonly model: string
  readonly tier: string
  readonly reasoning: ReasoningLevel
}

type AgentOverrideConfigResult = {
  readonly agentOverrideMap: LazycodexAgentOverrideMap
  readonly extraResults: readonly AgentTuiResult[]
}

const ROLE_AGENT_NAMES = ["explorer", "reasoning", "coding"] as const
const ROLE_AGENT_NAME_SET = new Set<string>(ROLE_AGENT_NAMES)
const EXTRA_CORE_ULW_AGENT_NAMES = CONFIGURABLE_LAZYCODEX_AGENT_NAMES.filter((name) => !ROLE_AGENT_NAME_SET.has(name))

export async function runSetupTui(args: { readonly noTui?: boolean }, context: unknown, deps: RunSetupTuiOptions = {}) {
  const prompts = deps.prompts ?? clack;
  const colors = deps.colors ?? pc;

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

  const discovery = readDiscoveryFromContext(context);
  const choices = buildModelChoicesForTui(discovery?.modelIds ?? []);
  const selectors = createSetupSelectors(prompts);
  const roleResults = await configureRoleAgents(discovery, choices, selectors);
  const agentConfig = {
    explorer: { model: roleResults[0].model, reasoningLevel: roleResults[0].reasoning },
    reasoning: { model: roleResults[1].model, reasoningLevel: roleResults[1].reasoning },
    coding: { model: roleResults[2].model, reasoningLevel: roleResults[2].reasoning },
  } satisfies LazycodexAgentConfig;
  const bundled = await loadBundledDefaultOmoOverrides();
  const agentOverrides = await configureAgentOverrides(prompts, discovery, choices, selectors, roleResults, agentConfig, bundled);
  const explorerModel = agentConfig.explorer.model;
  const effectiveMapping = discovery?.mapping
    ? { ...discovery.mapping, default: explorerModel, fast: resolveFastMappingSlot(discovery, roleResults, explorerModel) }
    : { default: explorerModel, fast: explorerModel, reasoning: agentConfig.reasoning.model, coding: agentConfig.coding.model };
  const configuredForInstall = discovery
    ? { ...discovery, mapping: effectiveMapping, agentConfig, agentOverrideMap: agentOverrides.agentOverrideMap }
    : null;

  const resultsText = [...roleResults, ...agentOverrides.extraResults]
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
      prompts.outro(colors.green("Grok adapter installed under ~/.grok. Run lfg doctor to verify anytime."));
    } else {
      prompts.outro("Install completed with warnings. See output above. Run lfg doctor to check.");
    }
    return { ok: success, status: success ? "tui_installed" : "tui_install_failed", executed: true };
  } catch (error) {
    prompts.outro("Install failed during execution. See errors above.");
    return { ok: false, status: "tui_error", error: error instanceof Error ? error.message : String(error), executed: false };
  }
}

function readDiscoveryFromContext(context: unknown): ModelDiscovery | null {
  if (!isRecord(context)) return null;
  const resolved = context.resolved;
  if (isRecord(resolved) && isModelDiscovery(resolved.discovery)) return resolved.discovery;
  const plan = context.plan;
  if (isRecord(plan) && isModelDiscovery(plan.modelDiscovery)) return plan.modelDiscovery;
  return null;
}

function isModelDiscovery(value: unknown): value is ModelDiscovery {
  if (!isRecord(value)) return false;
  return (
    typeof value.baseUrl === "string" &&
    typeof value.modelsUrl === "string" &&
    isStringArray(value.modelIds) &&
    isRecord(value.mapping) &&
    typeof value.mapping.default === "string" &&
    typeof value.mapping.fast === "string" &&
    typeof value.mapping.reasoning === "string" &&
    typeof value.mapping.coding === "string"
  );
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

async function configureRoleAgents(
  discovery: ModelDiscovery | null,
  choices: readonly ModelChoice[],
  selectors: { readonly modelSelector: ModelSelector; readonly tierSelector: TierSelector; readonly reasoningSelector: ReasoningSelector },
): Promise<readonly [AgentTuiResult, AgentTuiResult, AgentTuiResult]> {
  const explorer = await configureAgent(discovery, "explorer", discovery?.mapping.fast ?? discovery?.mapping.default ?? "grok-3-mini-fast", "low", choices, selectors);
  const reasoning = await configureAgent(discovery, "reasoning", discovery?.mapping.reasoning ?? "grok-4.20-0309-reasoning", "high", choices, selectors);
  const coding = await configureAgent(discovery, "coding", discovery?.mapping.coding ?? "gpt-5.3-codex-spark", "medium", choices, selectors);
  return [explorer, reasoning, coding];
}

async function configureAgent(
  discovery: ModelDiscovery | null,
  name: string,
  currentModel: string,
  currentReasoning: ReasoningLevel,
  choices: readonly ModelChoice[],
  selectors: { readonly modelSelector: ModelSelector; readonly tierSelector: TierSelector; readonly reasoningSelector: ReasoningSelector },
): Promise<AgentTuiResult> {
  const picked = await selectors.modelSelector({ agentName: name, current: currentModel, choices });
  const tier = await selectors.tierSelector({ agentName: name, current: defaultTierPromptForAgent(name) });
  const modelIds = discovery?.modelIds ?? [];
  const model = resolveModelForServiceTier(modelIds, picked, tier, {
    mappingFast: discovery?.mapping.fast,
    mappingDefault: discovery?.mapping.default,
  });
  const reasoning = toReasoningLevel(await selectors.reasoningSelector({ agentName: name, current: currentReasoning }));
  console.log(`  ${name}: ${model} / ${reasoning} (tier: ${tier})`);
  return { name, model, tier, reasoning };
}

async function configureAgentOverrides(
  prompts: typeof clack,
  discovery: ModelDiscovery | null,
  choices: readonly ModelChoice[],
  selectors: { readonly modelSelector: ModelSelector; readonly tierSelector: TierSelector; readonly reasoningSelector: ReasoningSelector },
  roleResults: readonly AgentTuiResult[],
  roleConfig: LazycodexAgentConfig,
  bundled: LazycodexAgentOverrideMap,
): Promise<AgentOverrideConfigResult> {
  const base = applyRoleTierToOverrides(mergeLazycodexAgentOverrides(roleConfig, bundled, {}), roleResults);
  const shouldConfigure = await prompts.confirm({ message: "Configure Core + ULW agent overrides?", initialValue: false });
  if (prompts.isCancel(shouldConfigure)) {
    prompts.cancel("lfg setup cancelled.");
    throw new Error("lfg setup cancelled");
  }
  if (shouldConfigure !== true) {
    return { agentOverrideMap: base, extraResults: [] };
  }
  const next: Record<string, LazycodexAgentModelOverride> = { ...base };
  const extraResults: AgentTuiResult[] = [];
  for (const name of EXTRA_CORE_ULW_AGENT_NAMES) {
    const current = base[name] ?? { model: discovery?.mapping.default ?? "gpt-5.4-mini", reasoningLevel: "medium" };
    const result = await configureAgent(discovery, name, current.model, current.reasoningLevel, choices, selectors);
    next[name] = {
      ...next[name],
      model: result.model,
      reasoningLevel: result.reasoning,
      serviceTier: serviceTierFromChoice(result.tier),
    };
    extraResults.push(result);
  }
  return { agentOverrideMap: next, extraResults };
}

function applyRoleTierToOverrides(
  map: LazycodexAgentOverrideMap,
  roleResults: readonly AgentTuiResult[],
): LazycodexAgentOverrideMap {
  const next: Record<string, LazycodexAgentModelOverride> = { ...map };
  for (const role of roleResults) {
    if (!ROLE_AGENT_NAME_SET.has(role.name)) continue;
    const prev = next[role.name];
    next[role.name] = {
      ...prev,
      model: role.model,
      reasoningLevel: role.reasoning,
      serviceTier: serviceTierFromChoice(role.tier),
    };
  }
  return next;
}

function resolveFastMappingSlot(
  discovery: ModelDiscovery,
  roleResults: readonly AgentTuiResult[],
  explorerModel: string,
): string {
  const explorer = roleResults.find((r) => r.name === "explorer");
  if (explorer !== undefined && explorer.tier === "fast") {
    return explorer.model;
  }
  return discovery.mapping.fast.length > 0 ? discovery.mapping.fast : explorerModel;
}

function toReasoningLevel(value: string): ReasoningLevel {
  if (value === "low" || value === "medium" || value === "high" || value === "xhigh") {
    return value;
  }
  return "medium";
}
