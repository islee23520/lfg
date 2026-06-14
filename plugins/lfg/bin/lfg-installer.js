import { modelDiscoveryEnv } from "./lfg-models";
import { configFieldsFromRun, grokInstallStepJson, INTERNAL_GROK_INSTALL_COMMAND, INTERNAL_GROK_INSTALL_PACKAGE, runGrokInstall, } from "../grok-install/run-grok-install";
import { verifyGrokInstallSurface } from "../grok-install/post-install-verify";
/** Legacy Codex installer; not run on default Grok setup path. */
export const LAZYCODEX_INSTALLER_ARGS = ["lazycodex-ai", "install"];
export const LAZYCODEX_INSTALLER_COMMAND = "npx lazycodex-ai install";
export const LFP_INSTALLER_ARGS = [];
export const LFP_INSTALLER_COMMAND = INTERNAL_GROK_INSTALL_COMMAND;
/** Grok-first setup: materialize lazycodex under ~/.grok via internal grok-install (no Codex npx). */
export async function runLazycodexInstaller(discovery = null, options = {}) {
    const agentConfig = discovery?.agentConfig ?? null;
    const env = mergeStringEnv(process.env, modelDiscoveryEnv(discovery, agentConfig));
    const grokOptions = {
        ...(options.force === undefined ? {} : { force: options.force }),
        ...(discovery?.agentOverrideMap === undefined ? {} : { fullAgentModels: discovery.agentOverrideMap }),
    };
    const grokRun = await runGrokInstall(discovery, env, grokOptions);
    const internalResult = grokInstallStepJson(grokRun.internalStep);
    const ok = grokRun.ok;
    const home = env.HOME ?? process.env.HOME ?? "";
    const postInstallVerify = home.length > 0 ? await verifyGrokInstallSurface({ home }) : { status: "missing_adapter", ok: false };
    const agentPaths = grokRun.lazycodexAgents?.written ?? [];
    const agentOverridesPath = grokRun.agentOverridesPath ?? null;
    const lfgConfigPath = grokRun.lfgConfigPath ?? null;
    const hooks = grokRun.hooks ?? null;
    return installJson({
        ok,
        status: ok ? "installed" : "install_failed",
        discovery,
        installers: [internalResult],
        failedExit: ok ? 0 : internalResult.exitCode,
        ...configFieldsFromRun(grokRun.configUpdate),
        internalStep: internalResult,
        postInstallVerify,
        agentPaths,
        agentTomlPaths: agentPaths,
        agentOverridesPath,
        lfgConfigPath,
        hooks,
        installPath: "grok",
        skippedCodexInstaller: true,
        preservedExistingSetup: grokRun.internalStep.skippedExistingSetup === true,
    });
}
function installJson(fields) {
    const { ok, status, discovery, installers, failedExit, ...rest } = fields;
    return {
        ok,
        status,
        command: "setup",
        executed: true,
        role: "lazycodex_adapter_installer",
        adapterPackage: INTERNAL_GROK_INSTALL_PACKAGE,
        companionPackage: INTERNAL_GROK_INSTALL_PACKAGE,
        installerCommand: INTERNAL_GROK_INSTALL_COMMAND,
        installerArgs: [],
        grokInstallerCommand: INTERNAL_GROK_INSTALL_COMMAND,
        lfpInstallerCommand: INTERNAL_GROK_INSTALL_COMMAND,
        lfpInstallerArgs: [],
        legacyCodexInstallerCommand: LAZYCODEX_INSTALLER_COMMAND,
        installers,
        exitCode: failedExit,
        stdout: installers.map((installer) => installer.stdout).filter((value) => value.length > 0).join("\n"),
        stderr: installers.map((installer) => installer.stderr).filter((value) => value.length > 0).join("\n"),
        lfgIsPlugin: false,
        ...(discovery === null ? {} : { modelDiscovery: discovery }),
        ...rest,
    };
}
function mergeStringEnv(base, extra) {
    const out = {};
    for (const [key, value] of Object.entries(base)) {
        if (typeof value === "string") {
            out[key] = value;
        }
    }
    return { ...out, ...extra };
}
