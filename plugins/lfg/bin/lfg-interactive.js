import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { runLazycodexInstaller } from "./lfg-installer";
import { INTERNAL_GROK_INSTALL_COMMAND } from "../grok-install/run-grok-install";
import { configureOmoAgentOverridesInteractively } from "../grok-install/agent-config-wizard";
import { defaultLazycodexAgentConfig, } from "./lfg-models";
import { resolveSetupDiscovery } from "../grok-install/resolve-setup-discovery";
import { formatRecommendationTable, ROLE_RECOMMENDATIONS, PERF_SNAPSHOT } from "../grok-install/model-recommendations";
import { maybeRequestGitHubStars } from "./lfg-github-stars";
import { printCancelled, printCompleted, printInstallIntro, printInstallPlan, printMagicWord, printStep } from "./lfg-interactive-ui";
export async function runInstallWizard(plan, resolved) {
    printInstallHeader();
    const reader = createLineReader();
    try {
        let discovery = resolved?.discovery ?? null;
        printStep(1, "Discovering Grok model endpoint");
        if (discovery === null) {
            discovery = await discoverModelsInteractively(reader);
        }
        else {
            printAutoDiscovery(resolved ?? { discovery, baseUrlUsed: null, baseUrlSource: "none", autoDiscovered: false });
        }
        // Bare `lfg setup` (plain human command, no --json, no --run) is meant to be conversational.
        // We show what was discovered (so the person sees which models will become the Grok aliases),
        // ask if they want to customize the main three role agents, and always require an explicit
        // final confirmation before touching the filesystem.
        //
        // This is the whole point of the interactive surface: the human gets to see the plan
        // (models etc.) and say "yes, do the direct install into a real ~/.grok/installed-plugins/lfg dir".
        printStep(2, "Configuring LazyCodex agents");
        const configuredDiscovery = discovery === null ? null : await configureLazycodexAgentsFull(reader, discovery);
        // This is the interactive gate for bare `lfg setup`.
        // The whole reason for the non --json / non --run command is to show the human
        // what models were found (these become the Grok aliases), let them customize the
        // main role agents if they want, and then **explicitly say yes** before we
        // do the direct install (real dir under ~/.grok/installed-plugins/lfg, no symlinks,
        // hooks + agents + overrides + config).
        printStep(3, "Reviewing install plan");
        printInstallPlan(plan, configuredDiscovery !== null);
        printMagicWord();
        const confirmed = await confirm(reader, "Install now? [y/N] ");
        if (!confirmed) {
            printCancelled();
            return { ok: true, status: "skipped", executed: false };
        }
        // Make it explicit in interactive that we do a direct materialization into Grok's tree.
        // This guarantees a real directory we own (no symlinks to ~/.codex or legacy locations).
        printStep(4, "Installing Grok adapter");
        output.write("\nDirect Grok install: the adapter will be copied into a real directory at ~/.grok/installed-plugins/lfg.\n");
        output.write("Any previous symlink or non-owned entry at that path will be replaced before applying hooks, agents, and config.\n\n");
        output.write(`\nRunning Grok install: ${INTERNAL_GROK_INSTALL_COMMAND}\n`);
        output.write("(Codex npx lazycodex-ai install is not used on this path.)\n\n");
        const result = await runLazycodexInstaller(configuredDiscovery);
        writeOutput(result.stdout);
        writeOutput(result.stderr);
        if (result.configUpdated === true) {
            output.write("Updated ~/.grok/config.toml with discovered model settings.\n");
        }
        printStep(5, "Finalizing setup");
        output.write(result.ok === true
            ? "Installed lazycodex/omo Grok adapter under ~/.grok for Grok Build.\n"
            : "Install failed. See installer output above.\n");
        printCompleted(result.ok === true);
        if (result.ok === true) {
            await maybeRequestGitHubStars(reader, confirm);
        }
        return result;
    }
    finally {
        reader.close();
    }
}
function printInstallHeader() {
    printInstallIntro();
}
async function discoverModelsInteractively(reader) {
    const home = process.env.HOME ?? "";
    const auto = home.length > 0 ? await resolveSetupDiscovery({ home, cliBaseUrl: null }) : null;
    if (auto && auto.discovery !== null && auto.discovery !== undefined) {
        printAutoDiscovery(auto);
        return auto.discovery;
    }
    output.write("OpenAI-compatible base URL (Enter = skip model mapping): ");
    const answer = await reader.next();
    const baseUrl = answer.done === true ? "" : answer.value.trim();
    if (baseUrl.length === 0) {
        output.write("Skipped model discovery. Installer will run without model mapping.\n\n");
        return null;
    }
    const manual = await resolveSetupDiscovery({ home: home.length > 0 ? home : "/tmp", cliBaseUrl: baseUrl });
    if (manual.discovery === null) {
        output.write(`Could not fetch models from ${baseUrl}. Installer will run without model mapping.\n\n`);
        return null;
    }
    printAutoDiscovery({ ...manual, baseUrlSource: "cli" });
    return manual.discovery;
}
function printAutoDiscovery(resolved) {
    const discovery = resolved.discovery;
    if (discovery === null) {
        return;
    }
    const sourceLabel = resolved.baseUrlSource === "config"
        ? "~/.grok/config.toml"
        : resolved.baseUrlSource === "default"
            ? "default proxy"
            : resolved.baseUrlSource;
    output.write(`Using models from ${resolved.baseUrlUsed ?? discovery.baseUrl} (${sourceLabel}).\n`);
    output.write(`Found ${discovery.modelIds.length} models; Grok [model.*] aliases will be written automatically.\n`);
    output.write("Model mapping:\n");
    output.write(`  default: ${discovery.mapping.default}\n`);
    output.write(`  fast: ${discovery.mapping.fast}\n`);
    output.write(`  reasoning: ${discovery.mapping.reasoning}\n`);
    output.write(`  coding: ${discovery.mapping.coding}\n\n`);
    // Show Grok-first model recommendations
    const recTable = formatRecommendationTable(discovery.modelIds);
    output.write(recTable + "\n");
}
// NOTE: We no longer auto-apply agent defaults to skip questions in the bare interactive path.
// Bare `lfg setup` always goes through configureLazycodexAgentsFull so the human is asked
// (role agents y/n, and always the final "Install now?"). Auto-discovery only avoids the
// base-URL prompt; it does not turn the guided setup into a silent "just do it".
async function configureLazycodexAgentsFull(reader, discovery) {
    const shouldConfigure = await confirm(reader, "Configure LazyCodex role agents (explorer / reasoning / coding)? [y/N] ");
    const roleConfig = shouldConfigure
        ? await readAgentConfig(reader, discovery)
        : defaultLazycodexAgentConfig(discovery);
    // Only enter the long-tail per-agent override wizard (librarian, plan, metis, ...) if the user
    // explicitly opted into role configuration. This keeps the common interactive "just install the adapter"
    // flow short: URL (optional) → role question (usually n) → Install now? → direct Grok materialization
    // (real dir under installed-plugins/lfg, replacing any symlink or legacy entry).
    let agentOverrideMap;
    if (shouldConfigure) {
        agentOverrideMap = await configureOmoAgentOverridesInteractively(reader, discovery, roleConfig, (text) => output.write(text), confirm);
    }
    else {
        // Use defaults (bundled omo overrides + role defaults). No long series of "Configure xxx?" questions.
        const bundled = await loadBundledDefaultOmoOverridesForInteractive();
        agentOverrideMap = await mergeLazycodexAgentOverrides(roleConfig, bundled, {});
    }
    return { ...discovery, agentConfig: roleConfig, agentOverrideMap };
}
// Small helpers to avoid importing the whole overrides module at top level just for the default path.
async function loadBundledDefaultOmoOverridesForInteractive() {
    const mod = await import("../grok-install/lazycodex-agent-overrides.js");
    return mod.loadBundledDefaultOmoOverrides();
}
async function mergeLazycodexAgentOverrides(roleConfig, bundled, extra) {
    const mod = await import("../grok-install/lazycodex-agent-overrides.js");
    return mod.mergeLazycodexAgentOverrides(roleConfig, bundled, extra);
}
async function readAgentConfig(reader, discovery) {
    const defaults = defaultLazycodexAgentConfig(discovery);
    return {
        explorer: await readAgentSetting(reader, discovery, "explorer", defaults.explorer.model, defaults.explorer.reasoningLevel),
        reasoning: await readAgentSetting(reader, discovery, "reasoning", defaults.reasoning.model, defaults.reasoning.reasoningLevel),
        coding: await readAgentSetting(reader, discovery, "coding", defaults.coding.model, defaults.coding.reasoningLevel),
    };
}
async function readAgentSetting(reader, discovery, agentName, defaultModel, defaultReasoningLevel) {
    const rec = ROLE_RECOMMENDATIONS.find((r) => r.role === agentName);
    if (rec !== undefined) {
        const perf = PERF_SNAPSHOT[rec.recommended];
        const latency = perf ? `${perf.latencyMs}ms` : "";
        const tps = perf ? `${perf.tokensPerSec}t/s` : "";
        output.write(`  Recommended: ${rec.recommended} (${latency}, ${tps}) - ${rec.rationale.split(".")[0]}\n`);
        const alts = rec.alternatives.filter((a) => discovery.modelIds.includes(a));
        if (alts.length > 0) {
            output.write(`  Alternatives: ${alts.join(", ")}\n`);
        }
    }
    const model = await readModelChoice(reader, discovery, `  ${agentName} model [${defaultModel}]: `, defaultModel);
    const reasoningLevel = await readReasoningLevel(reader, `  ${agentName} reasoning level [${defaultReasoningLevel}]: `, defaultReasoningLevel);
    output.write(`  ${agentName}: ${model} / ${reasoningLevel}\n`);
    return { model, reasoningLevel };
}
async function readModelChoice(reader, discovery, prompt, fallback) {
    output.write(prompt);
    const answer = await reader.next();
    const value = answer.done === true ? "" : answer.value.trim();
    if (value.length === 0) {
        return fallback;
    }
    if (discovery.modelIds.includes(value)) {
        return value;
    }
    output.write(`  Unknown model "${value}". Using ${fallback}.\n`);
    return fallback;
}
async function readReasoningLevel(reader, prompt, fallback) {
    output.write(prompt);
    const answer = await reader.next();
    const value = answer.done === true ? "" : answer.value.trim().toLowerCase();
    if (isReasoningLevel(value)) {
        return value;
    }
    if (value.length > 0) {
        output.write(`  Unknown reasoning level "${value}". Using ${fallback}.\n`);
    }
    return fallback;
}
function isReasoningLevel(value) {
    return value === "low" || value === "medium" || value === "high" || value === "xhigh";
}
async function confirm(reader, prompt) {
    output.write(prompt);
    const answer = await reader.next();
    return ["y", "yes"].includes(answer.done === true ? "" : answer.value.trim().toLowerCase());
}
function createLineReader() {
    const reader = createInterface({ input, output, terminal: false });
    const iterator = reader[Symbol.asyncIterator]();
    return { next: () => iterator.next(), close: () => reader.close() };
}
function writeOutput(value) {
    if (typeof value !== "string" || value.length === 0) {
        return;
    }
    output.write(value.endsWith("\n") ? value : `${value}\n`);
}
