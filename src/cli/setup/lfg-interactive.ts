import { stdin as input, stdout as output } from "node:process"
import { runLazycodexInstaller } from "./lfg-installer"
import { INTERNAL_GROK_INSTALL_COMMAND } from "../../grok/install/run-grok-install"
import { applyModelPreset, defaultLazycodexAgentConfig, withReasoningEffort, type ModelDiscovery, type ReasoningEffortChoice, type SetupPreset } from "../models/lfg-models"
import type { JsonObject } from "../../shared/json"
import type { ResolveSetupDiscoveryResult } from "../../grok/install/resolve-setup-discovery"
import { formatRecommendationTable } from "../../grok/models/model-recommendations"
import { maybeRequestGitHubStars } from "../publish/github/lfg-github-stars"
import { printCancelled, printCompleted, printInstallIntro, printInstallPlan, printMagicWord, printStep } from "./lfg-interactive-ui"
import type { CodingToolAdapterId } from "../../shared/coding-tool-adapter"
import {
  fallbackModelDiscovery,
  loadBundledDefaultOmoOverridesForInteractive,
  mergeLazycodexAgentOverrides,
} from "./lfg-interactive-agent-config"
import { buildVanillaGrokDiscovery, formatVanillaResults, formatVanillaSummary, type VanillaGrokConfig } from "./lfg-setup-tui-data"

type LineReader = AsyncIterator<string> & { readonly close: () => void }

export type InstallWizardOptions = {
  readonly modelSelector?: (spec: { agentName?: string; current: string; choices: Array<{ value: string; label: string; aliases: readonly string[]; key: string }> }) => Promise<string>;
  readonly tierSelector?: (spec: { agentName?: string; current: string }) => Promise<string>;
  readonly reasoningSelector?: (spec: { agentName?: string; current: string }) => Promise<string>;
  // Internal for TUI path: skip the final plan review + "Install now?" gate so the TUI layer can own it with Clack.
  readonly skipFinalGate?: boolean;
  // Internal for TUI path: skip the "Configure default / ULW target models and other LazyCodex agents?" long tail so it does not leak raw prompts.
  readonly skipOtherAgents?: boolean;
  readonly codingToolAdapter?: CodingToolAdapterId;
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
    } else if (isHostAuthOnlyDiscovery(discovery)) {
      printVanillaDiscovery(discovery)
    } else {
      await printAutoDiscovery(resolved ?? { discovery, baseUrlUsed: null, baseUrlSource: "none", autoDiscovered: false })
    }

    if (isTuiMode) {
      const baseDiscovery = discovery ?? fallbackModelDiscovery()
      const roleConfig = defaultLazycodexAgentConfig(baseDiscovery)
      const bundled = await loadBundledDefaultOmoOverridesForInteractive()
      const agentOverrideMap = await mergeLazycodexAgentOverrides(roleConfig, bundled, {})

      const configuredDiscovery: ModelDiscovery = {
        ...baseDiscovery,
        agentConfig: roleConfig,
        agentOverrideMap,
      }
      return { ok: true, status: "tui_configured", configuredDiscovery, executed: false };
    }

    // === Classic readline conversational path ONLY (no TUI indicators) ===
    printStep(2, "Configuring LazyCodex agents")
    const configuredDiscovery =
      discovery === null ? null : isHostAuthOnlyDiscovery(discovery) ? discovery : await configureLazycodexAgentsFull(reader, discovery, options)

    // This is the interactive gate for bare `lfg setup` (classic path only).
    printStep(3, "Reviewing install plan")
    printInstallPlan(plan, modelConfigLabel(configuredDiscovery))
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
    const result = await runLazycodexInstaller(configuredDiscovery, { codingToolAdapter: options.codingToolAdapter })
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

async function discoverModelsInteractively(_reader: LineReader): Promise<ModelDiscovery | null> {
  // Install never asks about CLI proxy. Vanilla Grok is the only
  // interactive default. Advanced multi-provider mapping is opt-in via `lfg setup --base-url ...`.
  const vanilla = buildVanillaGrokDiscovery(await loadBundledDefaultOmoOverridesForInteractive(), undefined)
  printVanillaDiscovery(vanilla)
  return vanilla
}

function isHostAuthOnlyDiscovery(discovery: ModelDiscovery): boolean {
  return discovery.baseUrl.trim().length === 0 && discovery.modelsUrl.trim().length === 0
}

function modelConfigLabel(discovery: ModelDiscovery | null): string {
  if (discovery === null) {
    return "skipped unless discovered later"
  }
  return isHostAuthOnlyDiscovery(discovery) ? "vanilla Grok host auth" : "auto-mapped from /v1/models"
}

function printVanillaDiscovery(discovery: ModelDiscovery): void {
  output.write(`${formatVanillaSummaryForLineSetup(discovery)}\n\n`)
  output.write(`${formatVanillaResults(vanillaConfigFromDiscovery(discovery))}\n\n`)
}

function formatVanillaSummaryForLineSetup(discovery: ModelDiscovery): string {
  // Use updated vanilla summary for OAuth + dynamic grok-3/grok-4 optimization
  return formatVanillaSummary(vanillaConfigFromDiscovery(discovery))
}

function vanillaConfigFromDiscovery(discovery: ModelDiscovery): VanillaGrokConfig {
  const agentConfig = discovery.agentConfig ?? defaultLazycodexAgentConfig(discovery)
  return {
    agentConfig,
    agentOverrideMap: discovery.agentOverrideMap ?? {},
    mapping: discovery.mapping,
  }
}

async function printAutoDiscovery(resolved: ResolveSetupDiscoveryResult): Promise<void> {
  const discovery = resolved.discovery
  if (discovery === null) {
    return
  }
  const sourceLabel =
    resolved.baseUrlSource === "config"
      ? "~/.grok/config.toml"
      : resolved.baseUrlSource === "providers"
        ? `${discovery.providerEndpoints?.length ?? 0} declared providers`
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


async function configureLazycodexAgentsFull(reader: LineReader, discovery: ModelDiscovery, _options: InstallWizardOptions = {}): Promise<ModelDiscovery> {
  const wantsRecommendations = await confirmDefaultYes(reader, "Use LLM recommendations from your available models? [Y/n] ")
  if (wantsRecommendations) {
    const recommendedDiscovery = withReasoningEffort(applyModelPreset(discovery, "auto"), "auto")
    printRecommendedModelSettings(recommendedDiscovery)
    const wantsModify = await confirm(reader, "Modify recommended model settings? [y/N] ")
    if (!wantsModify) {
      return recommendedDiscovery
    }
  }

  output.write("Choose one global model preset. Individual agent model prompts have been removed.\n")
  output.write("  1) auto: best available global routes (recommended)\n")
  output.write("  2) balanced: GPT default, Gemini fast, Grok reasoning/coding\n")
  output.write("  3) grok: prefer Grok for all routes\n")
  output.write("  4) gpt: prefer GPT for default/reasoning while coding stays on recommended agent routes\n")
  output.write("  5) gemini: prefer Gemini for long-context exploration\n")
  output.write("  6) glm: prefer GLM for default/reasoning\n")
  output.write("  7) multi: balanced routes plus provider-scoped base URLs\n")
  const preset = await readSetupPreset(reader)
  const reasoningEffort = await readReasoningEffort(reader)
  const presetDiscovery = withReasoningEffort(applyModelPreset(discovery, preset), reasoningEffort)
  const roleConfig = defaultLazycodexAgentConfig(presetDiscovery)
  output.write("Global model mapping:\n")
  output.write(`  default: ${presetDiscovery.mapping.default}\n`)
  output.write(`  fast: ${presetDiscovery.mapping.fast}\n`)
  output.write(`  reasoning: ${presetDiscovery.mapping.reasoning}\n`)
  output.write(`  coding: ${presetDiscovery.mapping.coding}\n\n`)
  // Do not set agentOverrideMap — the install path resolves per-agent overrides from
  // bundled JSON + availability checking. Setting {} would bypass that resolution.
  return { ...presetDiscovery, agentConfig: roleConfig }
}

function printRecommendedModelSettings(discovery: ModelDiscovery): void {
  const agents = defaultLazycodexAgentConfig(discovery)
  output.write("Recommended model settings:\n")
  output.write(`  default: ${discovery.mapping.default}\n`)
  output.write(`  fast: ${discovery.mapping.fast}\n`)
  output.write(`  reasoning: ${discovery.mapping.reasoning}\n`)
  output.write(`  coding: ${discovery.mapping.coding}\n`)
  output.write("Core agents:\n")
  output.write(`  explorer: ${agents.explorer.model} / ${agents.explorer.reasoningLevel}\n`)
  output.write(`  reasoning: ${agents.reasoning.model} / ${agents.reasoning.reasoningLevel}\n`)
  output.write(`  coding: ${agents.coding.model} / ${agents.coding.reasoningLevel}\n\n`)
}

async function readSetupPreset(reader: LineReader): Promise<SetupPreset> {
  output.write("Global preset [auto]: ")
  const answer = await reader.next()
  const value = answer.done === true ? "" : answer.value.trim().toLowerCase()
  if (value.length === 0 || value === "1" || value === "auto") return "auto"
  if (value === "2" || value === "balanced") return "balanced"
  if (value === "3" || value === "grok") return "grok"
  if (value === "4" || value === "gpt") return "gpt"
  if (value === "5" || value === "gemini") return "gemini"
  if (value === "6" || value === "glm") return "glm"
  if (value === "7" || value === "multi") return "multi"
  output.write(`Unknown preset "${value}". Using auto.\n`)
  return "auto"
}

async function readReasoningEffort(reader: LineReader): Promise<ReasoningEffortChoice> {
  output.write("Global reasoning effort [auto/low/medium/high/xhigh, Enter = auto]: ")
  const answer = await reader.next()
  const value = answer.done === true ? "" : answer.value.trim().toLowerCase()
  if (value.length === 0 || value === "auto") return "auto"
  if (value === "low" || value === "medium" || value === "high" || value === "xhigh") return value
  output.write(`Unknown reasoning effort "${value}". Using auto.\n`)
  return "auto"
}

async function confirm(reader: LineReader, prompt: string): Promise<boolean> {
  output.write(prompt)
  const answer = await reader.next()
  return ["y", "yes"].includes(answer.done === true ? "" : answer.value.trim().toLowerCase())
}

async function confirmDefaultYes(reader: LineReader, prompt: string): Promise<boolean> {
  output.write(prompt)
  const answer = await reader.next()
  const value = answer.done === true ? "" : answer.value.trim().toLowerCase()
  return value.length === 0 || value === "y" || value === "yes"
}

function createLineReader(): LineReader {
  const lines: string[] = []
  let buffer = ""
  let closed = false
  let pending: ((result: IteratorResult<string>) => void) | null = null

  const emitLine = (line: string): void => {
    if (pending === null) {
      lines.push(line)
      return
    }
    const resolve = pending
    pending = null
    resolve({ value: line, done: false })
  }
  const onData = (chunk: string | Buffer): void => {
    buffer += String(chunk)
    for (;;) {
      const newline = buffer.indexOf("\n")
      if (newline < 0) {
        return
      }
      const line = buffer.slice(0, newline).replace(/\r$/, "")
      buffer = buffer.slice(newline + 1)
      emitLine(line)
    }
  }
  const onEnd = (): void => {
    if (buffer.length > 0) {
      emitLine(buffer.replace(/\r$/, ""))
      buffer = ""
    }
    closed = true
    if (pending !== null) {
      const resolve = pending
      pending = null
      resolve({ value: "", done: true })
    }
  }

  input.setEncoding("utf8")
  input.on("data", onData)
  input.on("end", onEnd)
  input.resume()

  return {
    next: () => {
      const line = lines.shift()
      if (line !== undefined) {
        return Promise.resolve({ value: line, done: false })
      }
      if (closed) {
        return Promise.resolve({ value: "", done: true })
      }
      return new Promise<IteratorResult<string>>((resolve) => {
        pending = resolve
      })
    },
    close: () => {
      input.off("data", onData)
      input.off("end", onEnd)
    },
  }
}

function writeOutput(value: unknown): void {
  if (typeof value !== "string" || value.length === 0) {
    return
  }
  output.write(value.endsWith("\n") ? value : `${value}\n`)
}
