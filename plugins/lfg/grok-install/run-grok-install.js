import { lstat } from "node:fs/promises";
import { homedir } from "node:os";
import { grokConfigJson, writeGrokModelConfig } from "../bin/lfg-grok-config";
import { modelDiscoveryEnv } from "../bin/lfg-models";
import { ensureLfgAgentsPreferred, ensureLfgPluginsEnabled } from "./grok-plugins-enable";
import { ensureLfgConfigFiles } from "./lfg-config";
import { resolveLazycodexAgentOverrides, writeLazycodexAgentOverridesFile, } from "./lazycodex-agent-overrides";
import { resolveGlobalLazycodexAgentConfig } from "./resolve-global-agent-config";
import { readAdapterHooksTrust, resolveGrokAdapterPluginRoot } from "./grok-adapter-paths";
import { readGrokInstallStamp } from "./install";
import { runInternalGrokInstall } from "./run-internal";
import { syncLazycodexAgentsToGrokLedger } from "./sync-lazycodex-agents-to-grok";
import { componentInventoryPath } from "./component-inventory";
export const INTERNAL_GROK_INSTALL_PACKAGE = "lfg-grok-install";
export const INTERNAL_GROK_INSTALL_COMMAND = "@islee23520/lfg internal grok-install";
/** Single transaction: internal plugin sync then optional config.toml merge (lfg-owned sections). */
export async function runGrokInstall(discovery, env = process.env, options = {}) {
    const home = env.HOME ?? homedir();
    const existingSetup = options.force === true ? null : await resolveExistingStampedLfgSetup(home);
    if (existingSetup !== null) {
        const resolvedAgents = await resolveGlobalLazycodexAgentConfig(home, discovery);
        const configUpdate = discovery !== null
            ? await writeGrokModelConfig(discovery, {
                apiKey: env.OPENAI_API_KEY,
                home,
                agentConfig: resolvedAgents,
            })
            : null;
        const overrideMap = await resolveLazycodexAgentOverrides(home, resolvedAgents);
        const overridesPath = await writeLazycodexAgentOverridesFile(home, overrideMap);
        const configFiles = await ensureLfgConfigFiles(home, overrideMap);
        const lazycodexAgents = await syncLazycodexAgentsToGrokLedger(home, overrideMap);
        const pluginsEnabled = await ensureLfgPluginsEnabled(home);
        await ensureLfgAgentsPreferred(home);
        return {
            ok: true,
            configUpdate,
            internalStep: {
                ok: true,
                status: "already_installed",
                step: "internal_grok_install",
                packageName: INTERNAL_GROK_INSTALL_PACKAGE,
                mode: "preserve_existing_setup",
                skippedExistingSetup: true,
                componentInventoryPath: componentInventoryPath(existingSetup.pluginRoot),
                exitCode: 0,
                stdout: configUpdate === null
                    ? "existing Grok lfg setup preserved; pass --force to overwrite lfg-owned setup"
                    : "existing Grok lfg setup preserved; synced model config from discovered CLI proxy models",
                stderr: "",
            },
            lazycodexAgents,
            agentOverridesPath: overridesPath,
            lfgConfigPath: configFiles.configPath,
            pluginsEnabled,
        };
    }
    const agentConfig = discovery?.agentConfig ?? null;
    const internalEnv = {
        ...env,
        ...modelDiscoveryEnv(discovery, agentConfig),
        ...(options.force === true ? { LFG_SETUP_FORCE: "1" } : {}),
    };
    const internalStep = await runInternalGrokInstall(internalEnv);
    const resolvedAgents = await resolveGlobalLazycodexAgentConfig(home, discovery);
    const configUpdate = discovery !== null
        ? await writeGrokModelConfig(discovery, {
            apiKey: env.OPENAI_API_KEY,
            home,
            agentConfig: resolvedAgents,
        })
        : null;
    const overrideMap = discovery?.agentOverrideMap !== undefined
        ? discovery.agentOverrideMap
        : await resolveLazycodexAgentOverrides(home, resolvedAgents);
    const overridesPath = await writeLazycodexAgentOverridesFile(home, overrideMap);
    const configFiles = await ensureLfgConfigFiles(home, overrideMap);
    const lazycodexAgents = await syncLazycodexAgentsToGrokLedger(home, overrideMap);
    const pluginsEnabled = await ensureLfgPluginsEnabled(home);
    await ensureLfgAgentsPreferred(home);
    return {
        ok: internalStep.ok === true,
        configUpdate,
        internalStep,
        lazycodexAgents,
        agentOverridesPath: overridesPath,
        lfgConfigPath: configFiles.configPath,
        pluginsEnabled,
    };
}
async function resolveExistingStampedLfgSetup(home) {
    const resolved = await resolveGrokAdapterPluginRoot(home);
    const ok = resolved?.pluginDirName === "lfg" &&
        (await isRealDirectory(resolved.pluginRoot)) &&
        (await readGrokInstallStamp(resolved.pluginRoot)) !== null &&
        (await readAdapterHooksTrust(resolved.pluginRoot)).ok;
    return ok ? { pluginRoot: resolved.pluginRoot } : null;
}
async function isRealDirectory(path) {
    try {
        const stat = await lstat(path);
        return stat.isDirectory() && !stat.isSymbolicLink();
    }
    catch {
        return false;
    }
}
export function grokInstallStepJson(internalStep) {
    const base = {
        packageName: INTERNAL_GROK_INSTALL_PACKAGE,
        command: INTERNAL_GROK_INSTALL_COMMAND,
        args: [],
        exitCode: typeof internalStep.exitCode === "number" ? internalStep.exitCode : 1,
        stdout: typeof internalStep.stdout === "string" ? internalStep.stdout : "",
        stderr: typeof internalStep.stderr === "string" ? internalStep.stderr : "",
        ...(typeof internalStep.componentInventoryPath === "string"
            ? { componentInventoryPath: internalStep.componentInventoryPath }
            : {}),
    };
    if (typeof internalStep.warning === "string" && internalStep.warning.length > 0) {
        return { ...base, warning: internalStep.warning };
    }
    return base;
}
export function configFieldsFromRun(configUpdate) {
    if (configUpdate === null) {
        return {};
    }
    return {
        configUpdated: true,
        configPath: configUpdate.path,
        modelsBaseUrl: configUpdate.modelsBaseUrl,
        grokConfig: grokConfigJson(configUpdate),
    };
}
