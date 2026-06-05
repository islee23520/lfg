import { createInterface } from "node:readline/promises"
import { stdin as input, stdout as output } from "node:process"
import { findExistingGrokSettings, restoreGrokSettings, snapshotGrokSettings, type ExistingGrokSetting, type GrokSettingsSnapshot } from "./lfg-install-state"
import { LAZYCODEX_INSTALLER_COMMAND, runLazycodexInstaller } from "./lfg-installer"
import type { JsonObject } from "./lfg-json"

type LineReader = AsyncIterator<string> & { readonly close: () => void }

export async function runInstallWizard(plan: JsonObject): Promise<JsonObject> {
  printInstallHeader(plan)
  const reader = createLineReader()
  try {
    const confirmed = await confirmInstall(reader)
    if (!confirmed) {
      output.write("\nSkipped install. Nothing was changed.\n")
      output.write("Run again with: lfg setup\n")
      return { ok: true, status: "skipped", executed: false }
    }

    const existingSettings = await findExistingGrokSettings()
    let snapshot: GrokSettingsSnapshot | null = null
    if (existingSettings.length > 0) {
      output.write("\nExisting Grok lazycodex/agent settings were found:\n")
      for (const setting of existingSettings) output.write(`  - ${setting.label}: ${setting.path}\n`)
      const overwrite = await confirm(reader, "Overwrite existing Grok settings by running the installer? [y/N] ")
      if (!overwrite) {
        output.write("\nKept existing Grok settings. Installer was not run.\n")
        return { ok: true, status: "skipped_existing_grok_settings", executed: false, existingGrokSettings: existingSettings }
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
      return { ...result, existingGrokSettings: existingSettings, restoredGrokSettings: restoredSettings }
    }

    output.write("\nInstall failed. See installer output above.\n")
    printStablePluginLink(result)
    return { ...result, existingGrokSettings: existingSettings, restoredGrokSettings: restoredSettings }
  } finally {
    reader.close()
  }
}

function printInstallHeader(plan: JsonObject): void {
  const adapterRoot = typeof plan.adapterRoot === "string" ? plan.adapterRoot : "(unknown)"
  output.write("lfg setup\n")
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

function printStablePluginLink(result: JsonObject): void {
  const links = result.stablePluginLinks
  if (Array.isArray(links)) {
    for (const link of links) {
      if (isRecord(link) && link.status === "linked" && typeof link.name === "string" && typeof link.linkPath === "string") {
        output.write(`Registered Grok installed-plugin name: ${link.name} -> ${link.linkPath}\n`)
      }
    }
    return
  }

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
