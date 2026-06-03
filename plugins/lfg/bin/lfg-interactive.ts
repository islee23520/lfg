import { createInterface } from "node:readline/promises"
import { stdin as input, stdout as output } from "node:process"
import { configureGrokByok, DEFAULT_GROK_BYOK_MODEL_ID, type GrokByokConfigInput } from "./lfg-config"
import { findExistingGrokSettings, restoreGrokSettings, snapshotGrokSettings, type ExistingGrokSetting, type GrokSettingsSnapshot } from "./lfg-install-state"
import { LAZYCODEX_INSTALLER_COMMAND, runLazycodexInstaller } from "./lfg-installer"
import type { JsonObject } from "./lfg-json"

type LineReader = AsyncIterator<string> & { readonly close: () => void }
type ProviderChoice = "cli-proxy" | "cri-proxy" | "custom"

export async function runInstallWizard(plan: JsonObject): Promise<JsonObject> {
  printInstallHeader(plan)
  const reader = createLineReader()
  try {
    const confirmed = await confirmInstall(reader)
    if (!confirmed) {
      output.write("\nSkipped install. Nothing was changed.\n")
      output.write("Run again with: lfg install\n")
      const byok = await maybeConfigureGrokByok(reader)
      return { ok: true, status: "skipped", executed: false, grokByok: byok }
    }

    const existingSettings = await findExistingGrokSettings()
    let snapshot: GrokSettingsSnapshot | null = null
    if (existingSettings.length > 0) {
      output.write("\nExisting Grok lazycodex/agent settings were found:\n")
      for (const setting of existingSettings) output.write(`  - ${setting.label}: ${setting.path}\n`)
      const overwrite = await confirm(reader, "Overwrite existing Grok settings by running the installer? [y/N] ")
      if (!overwrite) {
        output.write("\nKept existing Grok settings. Installer was not run.\n")
        const byok = await maybeConfigureGrokByok(reader)
        return { ok: true, status: "skipped_existing_grok_settings", executed: false, existingGrokSettings: existingSettings, grokByok: byok }
      }
      snapshot = await snapshotGrokSettings(existingSettings)
      output.write(`\nBacked up existing Grok settings to: ${snapshot.root}\n`)
    }

    output.write(`\nRunning: ${LAZYCODEX_INSTALLER_COMMAND}\n\n`)
    const result = await runLazycodexInstaller()
    const stdout = typeof result.stdout === "string" ? result.stdout : ""
    const stderr = typeof result.stderr === "string" ? result.stderr : ""
    if (stdout) output.write(stdout.endsWith("\n") ? stdout : `${stdout}\n`)
    if (stderr) output.write(stderr.endsWith("\n") ? stderr : `${stderr}\n`)
    const restoredSettings = await maybeRestoreGrokSettings(reader, snapshot)

    if (result.ok === true) {
      output.write("\nInstalled lazycodex adapter for Grok Build.\n")
      printStablePluginLink(result)
      output.write("Verify with: grok inspect --json\n")
      const byok = await maybeConfigureGrokByok(reader)
      return { ...result, existingGrokSettings: existingSettings, restoredGrokSettings: restoredSettings, grokByok: byok }
    }

    output.write("\nInstall failed. See installer output above.\n")
    printStablePluginLink(result)
    const byok = await maybeConfigureGrokByok(reader)
    return { ...result, existingGrokSettings: existingSettings, restoredGrokSettings: restoredSettings, grokByok: byok }
  } finally {
    reader.close()
  }
}

function printInstallHeader(plan: JsonObject): void {
  const adapterRoot = typeof plan.adapterRoot === "string" ? plan.adapterRoot : "(unknown)"
  output.write("lfg install\n")
  output.write("\n")
  output.write("This will install the lazycodex Codex adapter so Grok Build can discover it.\n")
  output.write("lfg is only the installer helper; it is not a Grok plugin or runtime.\n")
  output.write("\n")
  output.write(`Installer: ${LAZYCODEX_INSTALLER_COMMAND}\n`)
  output.write(`Target:    ${adapterRoot}\n`)
  output.write("\n")
}

async function confirmInstall(reader: LineReader): Promise<boolean> {
  return confirm(reader, "Install now? [y/N] ")
}

async function maybeConfigureGrokByok(reader: LineReader): Promise<JsonObject> {
  output.write("\n")
  const confirmed = await confirm(reader, "Configure Grok BYOK now? [y/N] ")
  if (!confirmed) {
    output.write("\nSkipped Grok BYOK configuration. Nothing was changed.\n")
    return { ok: true, status: "skipped", executed: false }
  }

  const input = await promptGrokByokInput(reader)
  output.write(`\nWriting Grok BYOK config for model alias: ${input.modelAlias}\n`)
  const result = await configureGrokByok(input)
  output.write("Configured Grok BYOK. API key was written to ~/.grok/config.toml and not printed.\n")
  output.write(`Verify with: grok -m ${input.modelAlias} -p 'Reply LFG_GROK_BUILD_OK'\n`)
  return result
}

async function promptGrokByokInput(reader: LineReader): Promise<GrokByokConfigInput> {
  output.write("\nProvider options:\n")
  output.write("  1) CLI proxy\n")
  output.write("  2) CRI proxy\n")
  output.write("  3) Custom OpenAI-compatible provider\n")
  const provider = await promptProviderChoice(reader)
  const baseUrl = await promptRequired(reader, `${providerLabel(provider)} base URL `)
  const apiKey = await promptRequired(reader, "API key/token (input is visible in this shell) ")
  const modelAlias = await promptRequired(reader, "Grok model alias ")
  const modelId = withDefault(await question(reader, `Upstream model id [${DEFAULT_GROK_BYOK_MODEL_ID}] `), DEFAULT_GROK_BYOK_MODEL_ID)
  const displayName = withDefault(await question(reader, `Display name [${modelAlias}] `), modelAlias)
  return { baseUrl, apiKey, modelAlias, modelId, displayName }
}

async function confirm(reader: LineReader, prompt: string): Promise<boolean> {
  const answer = await question(reader, prompt)
  return ["y", "yes"].includes(answer?.trim().toLowerCase() ?? "")
}

async function question(reader: LineReader, prompt: string): Promise<string | null> {
  output.write(prompt)
  const line = await reader.next()
  return line.done === true ? null : line.value
}

function createLineReader(): LineReader {
  const reader = createInterface({ input, output, terminal: false })
  const iterator = reader[Symbol.asyncIterator]()
  return { next: () => iterator.next(), close: () => reader.close() }
}

async function maybeRestoreGrokSettings(reader: LineReader, snapshot: GrokSettingsSnapshot | null): Promise<readonly ExistingGrokSetting[]> {
  if (snapshot === null || snapshot.entries.length === 0) return []
  output.write("\n")
  const restore = await confirm(reader, "Restore previous Grok settings from backup? [y/N] ")
  if (!restore) {
    output.write("\nKept installer-updated Grok settings.\n")
    return []
  }
  const restored = await restoreGrokSettings(snapshot)
  output.write("\nRestored previous Grok settings.\n")
  return restored
}

async function promptProviderChoice(reader: LineReader): Promise<ProviderChoice> {
  while (true) {
    const choice = await question(reader, "Provider [1/2/3] ")
    if (choice === null) throw new Error("Provider choice is required.")
    const trimmed = choice.trim()
    if (trimmed === "1") return "cli-proxy"
    if (trimmed === "2") return "cri-proxy"
    if (trimmed === "3") return "custom"
    output.write("Choose 1, 2, or 3.\n")
  }
}

async function promptRequired(reader: LineReader, prompt: string): Promise<string> {
  while (true) {
    const value = await question(reader, prompt)
    if (value === null) throw new Error(`${prompt.trim()} is required.`)
    const trimmed = value.trim()
    if (trimmed) return trimmed
    output.write("This value is required.\n")
  }
}

function providerLabel(provider: ProviderChoice): string {
  switch (provider) {
    case "cli-proxy":
      return "CLI proxy"
    case "cri-proxy":
      return "CRI proxy"
    case "custom":
      return "Provider"
  }
}

function withDefault(value: string | null, fallback: string): string {
  const trimmed = value?.trim() ?? ""
  return trimmed ? trimmed : fallback
}

function printStablePluginLink(result: JsonObject): void {
  const link = result.stablePluginLink
  if (!isRecord(link)) return
  if (link.status === "linked" && typeof link.linkPath === "string") {
    output.write(`Registered Grok installed-plugin name: lfg -> ${link.linkPath}\n`)
    return
  }
  if (link.status === "conflict") output.write("Stable Grok installed-plugin name lfg was not changed because a non-symlink entry already exists.\n")
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
