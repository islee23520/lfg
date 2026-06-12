import { createInterface } from "node:readline/promises"
import { stdin as input, stdout as output } from "node:process"
import { runLazycodexInstaller } from "./lfg-installer"
import { INTERNAL_GROK_INSTALL_COMMAND } from "../grok-install/run-grok-install"
import { configureOmoAgentOverridesInteractively } from "../grok-install/agent-config-wizard"
import {
  defaultLazycodexAgentConfig,
  type LazycodexAgentConfig,
  type LazycodexAgentName,
  type ModelDiscovery,
  type ReasoningLevel,
} from "./lfg-models"
import type { JsonObject } from "./lfg-json"
import type { ResolveSetupDiscoveryResult } from "../grok-install/resolve-setup-discovery"
import { resolveSetupDiscovery } from "../grok-install/resolve-setup-discovery"
import type { LazycodexAgentOverrideMap } from "../grok-install/lazycodex-agent-overrides"
import { formatRecommendationTable, ROLE_RECOMMENDATIONS, PERF_SNAPSHOT } from "../grok-install/model-recommendations"
import { maybeRequestGitHubStars } from "./lfg-github-stars"
import { printCancelled, printCompleted, printInstallIntro, printInstallPlan, printMagicWord, printStep } from "./lfg-interactive-ui"

type LineReader = AsyncIterator<string> & { readonly close: () => void }

export type InstallWizardOptions = {
  readonly modelSelector?: (spec: { agentName?: string; current: string; choices: Array<{ value: string; label: string; aliases: readonly string[]; key: string }> }) => Promise<string>;
  readonly tierSelector?: (spec: { agentName?: string; current: string }) => Promise<string>;
  readonly reasoningSelector?: (spec: { agentName?: string; current: string }) => Promise<string>;
};

export async function runInstallWizard(plan: JsonObject, resolved?: ResolveSetupDiscoveryResult, options: InstallWizardOptions = {}): Promise<JsonObject> {
  printInstallHeader()
  const reader = createLineReader()
  try {
    let discovery = resolved?.discovery ?? null
    printStep(1, "Discovering Grok model endpoint")
    if (discovery === null) {
      discovery = await discoverModelsInteractively(reader)
    } else {
      printAutoDiscovery(resolved ?? { discovery, baseUrlUsed: null, baseUrlSource: "none", autoDiscovered: false })
    }

    // Bare `lfg setup` (plain human command, no --json, no --run) is meant to be conversational.
    // We show what was discovered (so the person sees which models will become the Grok aliases),
    // ask if they want to customize the main three role agents, and always require an explicit
    // final confirmation before touching the filesystem.
    //
    // This is the whole point of the interactive surface: the human gets to see the plan
    // (models etc.) and say "yes, do the direct install into a real ~/.grok/installed-plugins/lfg dir".
    printStep(2, "Configuring LazyCodex agents")
    const configuredDiscovery =
      discovery === null ? null : await configureLazycodexAgentsFull(reader, discovery, options)

    // This is the interactive gate for bare `lfg setup`.
    // The whole reason for the non --json / non --run command is to show the human
    // what models were found (these become the Grok aliases), let them customize the
    // main role agents if they want, and then **explicitly say yes** before we
    // do the direct install (real dir under ~/.grok/installed-plugins/lfg, no symlinks,
    // hooks + agents + overrides + config).
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
    output.write("\nDirect Grok install: the adapter will be copied into a real directory at ~/.grok/installed-plugins/lfg.\n")
    output.write("Any previous symlink or non-owned entry at that path will be replaced before applying hooks, agents, and config.\n\n")

    output.write(`\nRunning Grok install: ${INTERNAL_GROK_INSTALL_COMMAND}\n`)
    output.write("(Codex npx lazycodex-ai install is not used on this path.)\n\n")
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
  const home = process.env.HOME ?? ""
  const auto = home.length > 0 ? await resolveSetupDiscovery({ home, cliBaseUrl: null }) : null
  if (auto && auto.discovery !== null && auto.discovery !== undefined) {
    printAutoDiscovery(auto)
    return auto.discovery
  }
  output.write("OpenAI-compatible base URL (Enter = skip model mapping): ")
  const answer = await reader.next()
  const baseUrl = answer.done === true ? "" : answer.value.trim()
  if (baseUrl.length === 0) {
    output.write("Skipped model discovery. Installer will run without model mapping.\n\n")
    return null
  }
  const manual = await resolveSetupDiscovery({ home: home.length > 0 ? home : "/tmp", cliBaseUrl: baseUrl })
  if (manual.discovery === null) {
    output.write(`Could not fetch models from ${baseUrl}. Installer will run without model mapping.\n\n`)
    return null
  }
  printAutoDiscovery({ ...manual, baseUrlSource: "cli" })
  return manual.discovery
}

function printAutoDiscovery(resolved: ResolveSetupDiscoveryResult): void {
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
  const recTable = formatRecommendationTable(discovery.modelIds)
  output.write(recTable + "\n")
}

// NOTE: We no longer auto-apply agent defaults to skip questions in the bare interactive path.
// Bare `lfg setup` always goes through configureLazycodexAgentsFull so the human is asked
// (role agents y/n, and always the final "Install now?"). Auto-discovery only avoids the
// base-URL prompt; it does not turn the guided setup into a silent "just do it".


async function configureLazycodexAgentsFull(reader: LineReader, discovery: ModelDiscovery, options: InstallWizardOptions = {}): Promise<ModelDiscovery> {
  const shouldConfigure = await confirm(reader, "Configure LazyCodex role agents (explorer / reasoning / coding)? [y/N] ")
  const roleConfig = shouldConfigure
    ? await readAgentConfig(reader, discovery, options)
    : defaultLazycodexAgentConfig(discovery)

  // Only enter the long-tail per-agent override wizard (librarian, plan, metis, ...) if the user
  // explicitly opted into role configuration. This keeps the common interactive "just install the adapter"
  // flow short: URL (optional) → role question (usually n) → Install now? → direct Grok materialization
  // (real dir under installed-plugins/lfg, replacing any symlink or legacy entry).
  let agentOverrideMap: LazycodexAgentOverrideMap | undefined
  if (shouldConfigure) {
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

  return { ...discovery, agentConfig: roleConfig, agentOverrideMap }
}

// Small helpers to avoid importing the whole overrides module at top level just for the default path.
async function loadBundledDefaultOmoOverridesForInteractive() {
  const mod = await import("../grok-install/lazycodex-agent-overrides.js")
  return mod.loadBundledDefaultOmoOverrides()
}

async function mergeLazycodexAgentOverrides(
  roleConfig: LazycodexAgentConfig,
  bundled: any,
  extra: any,
) {
  const mod = await import("../grok-install/lazycodex-agent-overrides.js")
  return mod.mergeLazycodexAgentOverrides(roleConfig, bundled, extra)
}

async function readAgentConfig(reader: LineReader, discovery: ModelDiscovery, options: InstallWizardOptions = {}): Promise<LazycodexAgentConfig> {
  const defaults = defaultLazycodexAgentConfig(discovery)
  return {
    explorer: await readAgentSetting(reader, discovery, "explorer", defaults.explorer.model, defaults.explorer.reasoningLevel, options),
    reasoning: await readAgentSetting(reader, discovery, "reasoning", defaults.reasoning.model, defaults.reasoning.reasoningLevel, options),
    coding: await readAgentSetting(reader, discovery, "coding", defaults.coding.model, defaults.coding.reasoningLevel, options),
  }
}

async function readAgentSetting(
  reader: LineReader,
  discovery: ModelDiscovery,
  agentName: LazycodexAgentName,
  defaultModel: string,
  defaultReasoningLevel: ReasoningLevel,
  options: InstallWizardOptions = {},
) {
  const rec = ROLE_RECOMMENDATIONS.find((r) => r.role === agentName)
  if (rec !== undefined) {
    const perf = PERF_SNAPSHOT[rec.recommended]
    const latency = perf ? `${perf.latencyMs}ms` : ""
    const tps = perf ? `${perf.tokensPerSec}t/s` : ""
    output.write(`  Recommended: ${rec.recommended} (${latency}, ${tps}) - ${rec.rationale.split(".")[0]}\n`)
    const alts = rec.alternatives.filter((a) => discovery.modelIds.includes(a))
    if (alts.length > 0) {
      output.write(`  Alternatives: ${alts.join(", ")}\n`)
    }
  }
  // LFP-style framing: show Current and note that Enter keeps the configured value.
  output.write(`  Current: ${defaultModel} (reasoning: ${defaultReasoningLevel})\n`)
  output.write("  Default: keep the current LazyCodex/OMO value; press Enter to leave it unchanged.\n")
  const model = await readModelChoice(reader, discovery, `  ${agentName} model [${defaultModel}]: `, defaultModel, options.modelSelector)
  // Tier is only prompted when a tierSelector is provided (TUI path for LFP-style parity).
  // In classic readline we keep the previous minimal (model + reasoningLevel) question count so existing
  // canned-input tests continue to work. The TUI path supplies tierSelector and the captured transcript
  // will include the tier line inside the "Setup results" note.
  let tier: string | undefined
  if (typeof options.tierSelector === "function") {
    tier = await readTierChoice(reader, `  ${agentName} service tier [default]: `, "default", options.tierSelector)
  }
  const reasoningLevel = await readReasoningLevel(reader, `  ${agentName} reasoning level [${defaultReasoningLevel}]: `, defaultReasoningLevel, options.reasoningSelector)
  output.write(`  ${agentName}: ${model} / ${reasoningLevel}${tier ? ` (tier: ${tier})` : ""}\n`)
  return { model, reasoningLevel }
}

async function readTierChoice(
  reader: LineReader,
  prompt: string,
  fallback: string,
  tierSelector?: (spec: { agentName?: string; current: string }) => Promise<string>,
): Promise<string> {
  if (typeof tierSelector === "function") {
    // The selector is typically created with agentName context by the caller when needed.
    // Here we call without agentName (the TUI selector factories accept optional agentName).
    const selected = await tierSelector({ current: fallback })
    return selected ?? fallback
  }
  output.write(prompt)
  const answer = await reader.next()
  const value = answer.done === true ? "" : answer.value.trim().toLowerCase()
  if (value.length === 0) return fallback
  // Accept the small set we surface for parity.
  if (["default", "fast"].includes(value)) return value
  if (value === "1") return "default"
  if (value === "2") return "fast"
  output.write(`  Unknown tier "${value}". Using ${fallback}.\n`)
  return fallback
}

async function readModelChoice(
  reader: LineReader,
  discovery: ModelDiscovery,
  prompt: string,
  fallback: string,
  modelSelector?: (spec: { agentName?: string; current: string; choices: Array<{ value: string; label: string; aliases: readonly string[]; key: string }> }) => Promise<string>,
): Promise<string> {
  if (typeof modelSelector === "function") {
    // Build choice list for the injected selector (LFP groupModelAliases style).
    const choices = buildModelChoices(discovery.modelIds)
    const selected = await modelSelector({
      current: fallback,
      choices: choices.map((c) => ({ ...c, label: formatModelChoiceLabel(c) })),
    })
    return selected ?? fallback
  }
  output.write(prompt)
  const answer = await reader.next()
  const value = answer.done === true ? "" : answer.value.trim()
  if (value.length === 0) {
    return fallback
  }
  if (discovery.modelIds.includes(value)) {
    return value
  }
  output.write(`  Unknown model "${value}". Using ${fallback}.\n`)
  return fallback
}

async function readReasoningLevel(
  reader: LineReader,
  prompt: string,
  fallback: ReasoningLevel,
  reasoningSelector?: (spec: { agentName?: string; current: string }) => Promise<string>,
): Promise<ReasoningLevel> {
  if (typeof reasoningSelector === "function") {
    const selected = await reasoningSelector({ current: fallback })
    return (isReasoningLevel(selected) ? selected : fallback) as ReasoningLevel
  }
  output.write(prompt)
  const answer = await reader.next()
  const value = answer.done === true ? "" : answer.value.trim().toLowerCase()
  if (isReasoningLevel(value)) {
    return value
  }
  if (value.length > 0) {
    output.write(`  Unknown reasoning level "${value}". Using ${fallback}.\n`)
  }
  return fallback
}

function buildModelChoices(models: readonly string[]) {
  const groups = new Map<string, string[]>()
  for (const m of models) {
    const key = m.split("/").at(-1) ?? m
    const arr = groups.get(key) ?? []
    arr.push(m)
    groups.set(key, arr)
  }
  return [...groups.entries()].map(([key, aliases]) => {
    const unique = [...new Set(aliases)].sort((a, b) => a.localeCompare(b))
    const value = unique.find((a) => a === key) ?? unique.find((a) => a === `openai/${key}`) ?? unique[0]
    return { key, aliases: unique, value }
  })
}

function formatModelChoiceLabel(choice: { key: string; aliases: readonly string[] }) {
  return choice.aliases.length === 1 ? choice.aliases[0] : `${choice.key} (aliases: ${choice.aliases.join(", ")})`
}

function isReasoningLevel(value: string): value is ReasoningLevel {
  return value === "low" || value === "medium" || value === "high" || value === "xhigh"
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
