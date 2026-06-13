import { lstat } from "node:fs/promises";
import { homedir } from "node:os";
import { grokConfigJson, writeGrokModelConfig } from "../bin/lfg-grok-config";
import { modelDiscoveryEnv } from "../bin/lfg-models";
import { ensureLfgAgentsPreferred, ensureLfgPluginsEnabled, ensureLfgSubagentModels } from "./grok-plugins-enable";
import { ensureLfgConfigFiles } from "./lfg-config";
import { mergePortedHooksIntoPlugin } from "./extension-hooks";
import { ensureCuaDriverSkill } from "./ensure-cua-driver-skill";
import { ensureHephaestusModelGate } from "./ensure-hephaestus-model-gate";
import { normalizePluginHooksJson } from "./normalize-plugin-hooks";
import {
  resolveLazycodexAgentOverrides,
  writeLazycodexAgentOverridesFile
} from "./lazycodex-agent-overrides";
import { resolveGlobalLazycodexAgentConfig } from "./resolve-global-agent-config";
import { readAdapterHooksTrust, resolveGrokAdapterPluginRoot } from "./grok-adapter-paths";
import { readGrokInstallStamp } from "./install";
import { runInternalGrokInstall } from "./run-internal";
import { syncLazycodexAgentsToGrokLedger } from "./sync-lazycodex-agents-to-grok";
import { componentInventoryPath } from "./component-inventory";
import { applyRecommendationsToOverrideMap } from "./model-recommendation-patterns";
const INTERNAL_GROK_INSTALL_PACKAGE = "lfg-grok-install";
const INTERNAL_GROK_INSTALL_COMMAND = "@islee23520/lfg internal grok-install";
async function runGrokInstall(discovery, env = process.env, options = {}) {
  const home = env.HOME ?? homedir();
  const existingSetup = options.force === true ? null : await resolveExistingStampedLfgSetup(home);
  if (existingSetup !== null) {
    const resolvedAgents2 = await resolveGlobalLazycodexAgentConfig(home, discovery);
    const agentOverrideMap2 = discovery?.agentOverrideMap;
    const overrideMap2 = agentOverrideMap2 !== void 0 ? agentOverrideMap2 : applyRecommendationsToOverrideMap(
      await resolveLazycodexAgentOverrides(home, resolvedAgents2),
      discovery?.modelIds ?? [],
      discovery?.preset
    );
    const fullAgentModels2 = options.fullAgentModels ?? overrideMap2;
    const configUpdate2 = discovery !== null ? await writeGrokModelConfig(discovery, {
      apiKey: env.OPENAI_API_KEY,
      home,
      agentConfig: resolvedAgents2,
      fullAgentModels: fullAgentModels2
    }) : null;
    const overridesPath2 = await writeLazycodexAgentOverridesFile(home, overrideMap2);
    const configFiles2 = await ensureLfgConfigFiles(home, overrideMap2);
    const lazycodexAgents2 = await syncLazycodexAgentsToGrokLedger(home, overrideMap2);
    const pluginsEnabled2 = await ensureLfgPluginsEnabled(home);
    await ensureLfgAgentsPreferred(home);
    const subagentModels2 = await ensureLfgSubagentModels(
      home,
      subagentModelMapping(resolvedAgents2.explorer?.model ?? resolvedAgents2.reasoning?.model, resolvedAgents2.reasoning?.model, resolvedAgents2.coding?.model)
    );
    const hooksNormalized = await normalizePluginHooksJson(existingSetup.pluginRoot);
    await ensureCuaDriverSkill(existingSetup.pluginRoot);
    await ensureHephaestusModelGate(existingSetup.pluginRoot);
    return {
      ok: true,
      configUpdate: configUpdate2,
      internalStep: {
        ok: true,
        status: "already_installed",
        step: "internal_grok_install",
        packageName: INTERNAL_GROK_INSTALL_PACKAGE,
        mode: "preserve_existing_setup",
        skippedExistingSetup: true,
        componentInventoryPath: componentInventoryPath(existingSetup.pluginRoot),
        exitCode: 0,
        stdout: configUpdate2 === null ? "existing Grok lfg setup preserved; pass --force to overwrite lfg-owned setup" : "existing Grok lfg setup preserved; synced model config from discovered CLI proxy models",
        stderr: ""
      },
      lazycodexAgents: lazycodexAgents2,
      agentOverridesPath: overridesPath2,
      lfgConfigPath: configFiles2.configPath,
      pluginsEnabled: pluginsEnabled2,
      subagentModels: subagentModels2,
      hooks: {
        path: hooksNormalized.path,
        hookNames: hooksNormalized.hookNames,
        changed: hooksNormalized.changed
      }
    };
  }
  const agentConfig = discovery?.agentConfig ?? null;
  const internalEnv = {
    ...env,
    ...modelDiscoveryEnv(discovery, agentConfig),
    ...options.force === true ? { LFG_SETUP_FORCE: "1" } : {}
  };
  const internalStep = await runInternalGrokInstall(internalEnv);
  const resolvedAgents = await resolveGlobalLazycodexAgentConfig(home, discovery);
  const agentOverrideMap = discovery?.agentOverrideMap;
  const overrideMap = agentOverrideMap !== void 0 ? agentOverrideMap : applyRecommendationsToOverrideMap(
    await resolveLazycodexAgentOverrides(home, resolvedAgents),
    discovery?.modelIds ?? [],
    discovery?.preset
  );
  const fullAgentModels = options.fullAgentModels ?? overrideMap;
  const configUpdate = discovery !== null ? await writeGrokModelConfig(discovery, {
    apiKey: env.OPENAI_API_KEY,
    home,
    agentConfig: resolvedAgents,
    fullAgentModels
  }) : null;
  const overridesPath = await writeLazycodexAgentOverridesFile(home, overrideMap);
  const configFiles = await ensureLfgConfigFiles(home, overrideMap);
  const lazycodexAgents = await syncLazycodexAgentsToGrokLedger(home, overrideMap);
  const pluginsEnabled = await ensureLfgPluginsEnabled(home);
  await ensureLfgAgentsPreferred(home);
  const subagentModels = await ensureLfgSubagentModels(
    home,
    subagentModelMapping(
      resolvedAgents.explorer?.model ?? "grok-3-mini-fast",
      resolvedAgents.reasoning?.model ?? "grok-4.20-0309-reasoning",
      resolvedAgents.coding?.model ?? "grok-4.20-0309-non-reasoning"
    )
  );
  const pluginRootAfterInstall = (await resolveGrokAdapterPluginRoot(home))?.pluginRoot;
  let hooksFresh = null;
  if (pluginRootAfterInstall) {
    const norm = await normalizePluginHooksJson(pluginRootAfterInstall);
    await ensureCuaDriverSkill(pluginRootAfterInstall);
    await ensureHephaestusModelGate(pluginRootAfterInstall);
    hooksFresh = { path: norm.path, hookNames: norm.hookNames, changed: norm.changed };
  }
  return {
    ok: internalStep.ok === true,
    configUpdate,
    internalStep,
    lazycodexAgents,
    agentOverridesPath: overridesPath,
    lfgConfigPath: configFiles.configPath,
    pluginsEnabled,
    subagentModels,
    hooks: hooksFresh
  };
}
async function resolveExistingStampedLfgSetup(home) {
  const resolved = await resolveGrokAdapterPluginRoot(home);
  const ok = resolved?.location === "native_plugins" && resolved.pluginDirName === "lfg" && await isRealDirectory(resolved.pluginRoot) && await readGrokInstallStamp(resolved.pluginRoot) !== null && (await readAdapterHooksTrust(resolved.pluginRoot)).ok;
  return ok ? { pluginRoot: resolved.pluginRoot } : null;
}
function subagentModelMapping(defaultModel, reasoningModel, codingModel) {
  return {
    ...defaultModel === void 0 ? {} : { default: defaultModel },
    ...reasoningModel === void 0 ? {} : { reasoning: reasoningModel },
    ...codingModel === void 0 ? {} : { coding: codingModel }
  };
}
async function isRealDirectory(path) {
  try {
    const stat = await lstat(path);
    return stat.isDirectory() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
}
function grokInstallStepJson(internalStep) {
  const base = {
    packageName: INTERNAL_GROK_INSTALL_PACKAGE,
    command: INTERNAL_GROK_INSTALL_COMMAND,
    args: [],
    exitCode: typeof internalStep.exitCode === "number" ? internalStep.exitCode : 1,
    stdout: typeof internalStep.stdout === "string" ? internalStep.stdout : "",
    stderr: typeof internalStep.stderr === "string" ? internalStep.stderr : "",
    ...typeof internalStep.componentInventoryPath === "string" ? { componentInventoryPath: internalStep.componentInventoryPath } : {}
  };
  if (typeof internalStep.warning === "string" && internalStep.warning.length > 0) {
    return { ...base, warning: internalStep.warning };
  }
  return base;
}
function configFieldsFromRun(configUpdate) {
  if (configUpdate === null) {
    return {};
  }
  return {
    configUpdated: true,
    configPath: configUpdate.path,
    modelsBaseUrl: configUpdate.modelsBaseUrl,
    grokConfig: grokConfigJson(configUpdate)
  };
}
export {
  INTERNAL_GROK_INSTALL_COMMAND,
  INTERNAL_GROK_INSTALL_PACKAGE,
  configFieldsFromRun,
  grokInstallStepJson,
  runGrokInstall
};
