import { createInterface } from "node:readline/promises"
import { stdin as input, stdout as output } from "node:process"
import { LAZYCODEX_INSTALLER_COMMAND, runLazycodexInstaller } from "./lfg-installer"
import { INTERNAL_GROK_INSTALL_COMMAND } from "../grok-install/run-grok-install"
import { defaultLazycodexAgentConfig, fetchModelDiscovery, type LazycodexAgentConfig, type LazycodexAgentName, type ModelDiscovery, type ReasoningLevel } from "./lfg-models"
import type { JsonObject } from "./lfg-json"

type LineReader = AsyncIterator<string> & { readonly close: () => void }

export async function runInstallWizard(plan: JsonObject): Promise<JsonObject> {
  printInstallHeader()
  const reader = createLineReader()
  try {
    const discovery = await discoverModelsInteractively(reader)
    const configuredDiscovery = discovery === null ? null : await configureLazycodexAgents(reader, discovery)
    const confirmed = await confirm(reader, "Install now? [y/N] ")
    if (!confirmed) {
      output.write("\nSkipped install. Nothing was changed.\n")
      output.write("Run again with: lfg setup\n")
      return { ok: true, status: "skipped", executed: false }
    }

    output.write(`\nRunning: ${LAZYCODEX_INSTALLER_COMMAND}\n`)
    output.write(`Running: ${INTERNAL_GROK_INSTALL_COMMAND}\n\n`)
    const result = await runLazycodexInstaller(configuredDiscovery)
    writeOutput(result.stdout)
    writeOutput(result.stderr)
    if (result.configUpdated === true) {
      output.write("Updated ~/.grok/config.toml with discovered model settings.\n")
    }
    output.write(
      result.ok === true
        ? "\nInstalled lazycodex-ai and Grok adapter for Grok Build.\n"
        : "\nInstall failed. See installer output above.\n",
    )
    return result
  } finally {
    reader.close()
  }
}

function printInstallHeader(): void {
  output.write("lfg setup\n\n")
  output.write("This helper runs lazycodex-ai install and the internal Grok adapter for Grok Build.\n")
  output.write("lfg is only the package-facing setup helper; it is not a plugin or runtime.\n\n")
  output.write(`Installer: ${LAZYCODEX_INSTALLER_COMMAND}\n`)
  output.write(`Installer: ${INTERNAL_GROK_INSTALL_COMMAND}\n\n`)
}

async function discoverModelsInteractively(reader: LineReader): Promise<ModelDiscovery | null> {
  output.write("OpenAI-compatible base URL (serving /v1/models): ")
  const answer = await reader.next()
  const baseUrl = answer.done === true ? "" : answer.value.trim()
  if (baseUrl.length === 0) {
    output.write("Skipped model discovery. Installer will run without model mapping.\n\n")
    return null
  }
  output.write(`Fetching models from ${baseUrl} ...\n`)
  const discovery = await fetchModelDiscovery(baseUrl)
  output.write(`Found ${discovery.modelIds.length} models.\n`)
  output.write("Model mapping:\n")
  output.write(`  default: ${discovery.mapping.default}\n`)
  output.write(`  fast: ${discovery.mapping.fast}\n`)
  output.write(`  reasoning: ${discovery.mapping.reasoning}\n`)
  output.write(`  coding: ${discovery.mapping.coding}\n\n`)
  return discovery
}

async function configureLazycodexAgents(reader: LineReader, discovery: ModelDiscovery): Promise<ModelDiscovery> {
  const shouldConfigure = await confirm(reader, "Configure LazyCodex agents? [y/N] ")
  if (!shouldConfigure) {
    return { ...discovery, agentConfig: defaultLazycodexAgentConfig(discovery) }
  }
  output.write("\nLazyCodex agent model configuration\n")
  output.write("Choose from fetched /v1/models only. Leave blank to keep the suggested value.\n")
  output.write(`Available models: ${discovery.modelIds.join(", ")}\n\n`)
  return { ...discovery, agentConfig: await readAgentConfig(reader, discovery) }
}

async function readAgentConfig(reader: LineReader, discovery: ModelDiscovery): Promise<LazycodexAgentConfig> {
  const defaults = defaultLazycodexAgentConfig(discovery)
  return {
    explorer: await readAgentSetting(reader, discovery, "explorer", defaults.explorer.model, defaults.explorer.reasoningLevel),
    reasoning: await readAgentSetting(reader, discovery, "reasoning", defaults.reasoning.model, defaults.reasoning.reasoningLevel),
    coding: await readAgentSetting(reader, discovery, "coding", defaults.coding.model, defaults.coding.reasoningLevel),
  }
}

async function readAgentSetting(reader: LineReader, discovery: ModelDiscovery, agentName: LazycodexAgentName, defaultModel: string, defaultReasoningLevel: ReasoningLevel) {
  const model = await readModelChoice(reader, discovery, `${agentName} model [${defaultModel}]: `, defaultModel)
  const reasoningLevel = await readReasoningLevel(reader, `${agentName} reasoning level [${defaultReasoningLevel}]: `, defaultReasoningLevel)
  output.write(`  ${agentName}: ${model} / ${reasoningLevel}\n`)
  return { model, reasoningLevel }
}

async function readModelChoice(reader: LineReader, discovery: ModelDiscovery, prompt: string, fallback: string): Promise<string> {
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

async function readReasoningLevel(reader: LineReader, prompt: string, fallback: ReasoningLevel): Promise<ReasoningLevel> {
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
