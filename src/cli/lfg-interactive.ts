import { createInterface } from "node:readline/promises"
import { stdin as input, stdout as output } from "node:process"
import { runLazycodexInstaller } from "./lfg-installer"
import { INTERNAL_GROK_INSTALL_COMMAND } from "../grok-adapter/run-grok-install"
import { configureOmoAgentOverridesInteractively } from "../grok-adapter/agent-config-wizard"
import { defaultLazycodexAgentConfig, type ModelDiscovery } from "./lfg-models"
import type { JsonObject } from "./lfg-json"
import type { ResolveSetupDiscoveryResult } from "../grok-adapter/resolve-setup-discovery"
import { resolveSetupDiscovery } from "../grok-adapter/resolve-setup-discovery"
import type { LazycodexAgentOverrideMap } from "../grok-adapter/lazycodex-agent-overrides"
import { formatRecommendationTable } from "../grok-adapter/model-recommendations"
import { maybeRequestGitHubStars } from "./lfg-github-stars"
import { printCancelled, printCompleted, printInstallIntro, printInstallPlan, printMagicWord, printStep } from "./lfg-interactive-ui"
import { resolveGrokSetupHome } from "../grok-adapter/grok-home"
import {
  fallbackModelDiscovery,
  loadBundledDefaultOmoOverridesForInteractive,
  mergeLazycodexAgentOverrides,
  readAgentConfig,
} from "./lfg-interactive-agent-config"

type LineReader = AsyncIterator<string> & { readonly close: () => void }

export type InstallWizardOptions = {
  readonly modelSelector?: (spec: { agentName?: string; current: string; choices: Array<{ value: string; label: string; aliases: readonly string[]; key: string }> }) => Promise<string>;
  readonly tierSelector?: (spec: { agentName?: string; current: string }) => Promise<string>;
  readonly reasoningSelector?: (spec: { agentName?: string; current: string }) => Promise<string>;
  // Internal for TUI path: skip the final plan review + "Install now?" gate so the TUI layer can own it with Clack.
  readonly skipFinalGate?: boolean;
  // Internal for TUI path: skip the "Configure default / ULW target models and other LazyCodex agents?" long tail so it does not leak raw prompts.
  readonly skipOtherAgents?: boolean;
};

export async function runInstallWizard(plan: JsonObject, resolved?: ResolveSetupDiscoveryResult, options: InstallWizardOptions = {}): Promise<JsonObject> {
  // Clack TUI owns prompts and final install framing; this path only prepares configuredDiscovery.
  const isTuiMode = !!(options && (
    options.modelSelector || options.tierSelector || options.reasoningSelector ||
    options.skipFinalGate || options.skipOtherAgents
  ));

  printInstallHeader()
  const reader = createLineReader()
  try {
    let discovery = resolved?.discovery ?? null
    printStep(1, "Discovering Grok model endpoint")
    if (discovery === null) {
      discovery = await discoverModelsInteractively(reader)
    } else {
      await printAutoDiscovery(resolved ?? { discovery, baseUrlUsed: null, baseUrlSource: "none", autoDiscovered: false })
    }

    if (isTuiMode) {
      // TUI fast path: Clack selects the role agents and owns later gates.
      const roleConfig = await readAgentConfig(reader, discovery ?? fallbackModelDiscovery(), options);

      // Always take bundled defaults for the rest of the agents; never ask about "other" agents.
      const bundled = await loadBundledDefaultOmoOverridesForInteractive();
      const agentOverrideMap = await mergeLazycodexAgentOverrides(roleConfig, bundled, {});

      const configuredDiscovery: ModelDiscovery = {
        ...(discovery ?? fallbackModelDiscovery()),
        agentConfig: roleConfig,
        agentOverrideMap,
      }
      return { ok: true, status: "tui_configured", configuredDiscovery, executed: false };
    }

    // === Classic readline conversational path ONLY (no TUI indicators) ===
    printStep(2, "Configuring LazyCodex agents")
    const configuredDiscovery =
      discovery === null ? null : await configureLazycodexAgentsFull(reader, discovery, options)

    // This is the interactive gate for bare `lfg setup` (classic path only).
    printStep(3, "Reviewing install plan")
    printInstallPlan(plan, configuredDiscovery !== null)
    printMagicWord()
    const confirmed = await confirm(reader, "Install now? [y/N] ")
    if (!confirmed) {
      printCancelled()
      return { ok: true, status: "skipped", executed: false }
    }

    // Make it explicit in interactive that we do a direct materialization into Grok's tree.
    // This guarantees a real directory we own (no symlinks to ~/.codex or legacy locations).
    printStep(4, "Installing Grok adapter")
    output.write("\nDirect Grok install: the adapter will be copied into a real directory at ~/.grok/plugins/lfg.\n")
    output.write("Any previous symlink or non-owned entry at that path will be replaced before applying hooks, agents, and config.\n\n")

    output.write(`\nRunning Grok install: ${INTERNAL_GROK_INSTALL_COMMAND}\n`)
    output.write("(Codex-home bootstrap is not used on this path.)\n\n")
    const result = await runLazycodexInstaller(configuredDiscovery)
    writeOutput(result.stdout)
    writeOutput(result.stderr)
    if (result.configUpdated === true) {
      output.write("Updated ~/.grok/config.toml with discovered model settings.\n")
    }
    printStep(5, "Finalizing setup")
    output.write(
      result.ok === true
        ? "Installed lazycodex/omo Grok adapter under ~/.grok for Grok Build.\n"
        : "Install failed. See installer output above.\n",
    )
    printCompleted(result.ok === true)
    if (result.ok === true) {
      await maybeRequestGitHubStars(reader, confirm)
    }
    return result
  } finally {
    reader.close()
  }
}

function printInstallHeader(): void {
  printInstallIntro()
}

async function discoverModelsInteractively(reader: LineReader): Promise<ModelDiscovery | null> {
  const home = resolveGrokSetupHome(process.env)
  const auto = await resolveSetupDiscovery({ home, cliBaseUrl: null })
  if (auto && auto.discovery !== null && auto.discovery !== undefined) {
    await printAutoDiscovery(auto)
    return auto.discovery
  }
  output.write("OpenAI-compatible base URL (Enter = skip model mapping): ")
  const answer = await reader.next()
  const baseUrl = answer.done === true ? "" : answer.value.trim()
  if (baseUrl.length === 0) {
    output.write("Skipped model discovery. Installer will run without model mapping.\n\n")
    return null
  }
  const manual = await resolveSetupDiscovery({ home, cliBaseUrl: baseUrl })
  if (manual.discovery === null) {
    output.write(`Could not fetch models from ${baseUrl}. Installer will run without model mapping.\n\n`)
    return null
  }
  await printAutoDiscovery({ ...manual, baseUrlSource: "cli" })
  return manual.discovery
}

async function printAutoDiscovery(resolved: ResolveSetupDiscoveryResult): Promise<void> {
  const discovery = resolved.discovery
  if (discovery === null) {
    return
  }
  const sourceLabel =
    resolved.baseUrlSource === "config"
      ? "~/.grok/config.toml"
      : resolved.baseUrlSource === "default"
        ? "default proxy"
        : resolved.baseUrlSource
  output.write(`Using models from ${resolved.baseUrlUsed ?? discovery.baseUrl} (${sourceLabel}).\n`)
  output.write(`Found ${discovery.modelIds.length} models; Grok [model.*] aliases will be written automatically.\n`)
  output.write("Model mapping:\n")
  output.write(`  default: ${discovery.mapping.default}\n`)
  output.write(`  fast: ${discovery.mapping.fast}\n`)
  output.write(`  reasoning: ${discovery.mapping.reasoning}\n`)
  output.write(`  coding: ${discovery.mapping.coding}\n\n`)

  // Show Grok-first model recommendations
  const bundledOverrides = await loadBundledDefaultOmoOverridesForInteractive()
  const bundledRecMap = Object.fromEntries(
    Object.entries(bundledOverrides).map(([name, o]) => [
      name,
      {
        model: o.model,
        ...(o.modelFallback !== undefined ? { model_fallback: o.modelFallback } : {}),
        ...(o.roleRationale !== undefined ? { role_rationale: o.roleRationale } : {}),
      },
    ]),
  )
  const recTable = formatRecommendationTable(discovery.modelIds, bundledRecMap)
  output.write(recTable + "\n")
}

// NOTE: We no longer auto-apply agent defaults to skip questions in the bare interactive path.
// Bare `lfg setup` always goes through configureLazycodexAgentsFull so the human is asked
// (role agents y/n, and always the final "Install now?"). Auto-discovery only avoids the
// base-URL prompt; it does not turn the guided setup into a silent "just do it".


async function configureLazycodexAgentsFull(reader: LineReader, discovery: ModelDiscovery, options: InstallWizardOptions = {}): Promise<ModelDiscovery> {
  // When TUI selectors are injected we force the role configuration path so the three main
  // agents are presented via nice Clack selects (with Current/Recommended context printed before each).
  // This avoids a raw "Configure role agents? [y/N]" readline prompt during TUI capture.
  const hasTuiSelectors = !!(options.modelSelector || options.tierSelector || options.reasoningSelector)
  const shouldConfigure = hasTuiSelectors
    ? true
    : await confirm(reader, "Configure LazyCodex role agents (explorer / reasoning / coding)? [y/N] ")
  const roleConfig = shouldConfigure
    ? await readAgentConfig(reader, discovery, options)
    : defaultLazycodexAgentConfig(discovery)

  // Only enter the long-tail per-agent override wizard (librarian, plan, metis, ...) if the user
  // explicitly opted into role configuration. This keeps the common interactive "just install the adapter"
  // flow short: URL (optional) → role question (usually n) → Install now? → direct Grok materialization
  // (real dir under src, replacing any symlink or legacy entry).
  let agentOverrideMap: LazycodexAgentOverrideMap | undefined
  const hasTuiForLongTail = !!(options.modelSelector || options.tierSelector || options.reasoningSelector)
  if (options.skipOtherAgents || hasTuiForLongTail) {
    // TUI path (or explicit skip): do not invoke readline long-tail prompts.
    const bundled = await loadBundledDefaultOmoOverridesForInteractive()
    agentOverrideMap = await mergeLazycodexAgentOverrides(roleConfig, bundled, {})
  } else if (shouldConfigure) {
    agentOverrideMap = await configureOmoAgentOverridesInteractively(
      reader,
      discovery,
      roleConfig,
      (text) => output.write(text),
      confirm,
      options,
    )
  } else {
    // Use defaults (bundled omo overrides + role defaults). No long series of "Configure xxx?" questions.
    const bundled = await loadBundledDefaultOmoOverridesForInteractive()
    agentOverrideMap = await mergeLazycodexAgentOverrides(roleConfig, bundled, {})
  }

  // Use the user-selected explorer model as the effective global default so [models].default
  // and lazycodex.models.default reflect a deliberate setup choice.
  const effectiveMapping = discovery.mapping
    ? { ...discovery.mapping, default: roleConfig.explorer.model }
    : { default: roleConfig.explorer.model, fast: roleConfig.explorer.model, reasoning: roleConfig.reasoning.model, coding: roleConfig.coding.model }

  return { ...discovery, mapping: effectiveMapping, agentConfig: roleConfig, agentOverrideMap }
}

async function confirm(reader: LineReader, prompt: string): Promise<boolean> {
  output.write(prompt)
  const answer = await reader.next()
  return ["y", "yes"].includes(answer.done === true ? "" : answer.value.trim().toLowerCase())
}

function createLineReader(): LineReader {
  const reader = createInterface({ input, output, terminal: false })
  const iterator = reader[Symbol.asyncIterator]()
  return { next: () => iterator.next(), close: () => reader.close() }
}

function writeOutput(value: unknown): void {
  if (typeof value !== "string" || value.length === 0) {
    return
  }
  output.write(value.endsWith("\n") ? value : `${value}\n`)
}
