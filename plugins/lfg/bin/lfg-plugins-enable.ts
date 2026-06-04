import { readFile, writeFile } from "node:fs/promises"
import { grokConfigPath, writeGrokConfigAtomically } from "./lfg-config"
import type { JsonObject } from "./lfg-json"

const LAZYCODEX_PLUGIN_NAME = "lazycodex"

export async function enableLazycodexPlugin(configPath: string = grokConfigPath()): Promise<JsonObject> {
  const previous = await readConfigOrEmpty(configPath)
  const enabled = parsePluginsEnabled(previous)
  if (enabled.includes(LAZYCODEX_PLUGIN_NAME)) return { ok: true, status: "already_enabled", executed: false, target: configPath, enabled }
  const nextEnabled = [...enabled, LAZYCODEX_PLUGIN_NAME]
  const backupPath = previous ? `${configPath}.lfg-backup-${timestamp()}` : null
  if (backupPath) await writeFile(backupPath, previous)
  await writeGrokConfigAtomically(configPath, upsertPluginsEnabled(previous, nextEnabled))
  return { ok: true, status: "enabled", executed: true, target: configPath, backupPath, enabled: nextEnabled }
}

function parsePluginsEnabled(source: string): string[] {
  const enabled: string[] = []
  let inPlugins = false
  let inEnabled = false
  for (const line of source.split(/\r?\n/)) {
    const section = line.match(/^\s*\[([^\]]+)\]\s*$/)
    if (section) {
      inPlugins = section[1] === "plugins"
      inEnabled = false
      continue
    }
    if (!inPlugins) continue
    if (/^\s*enabled\s*=\s*\[\s*$/.test(line)) {
      inEnabled = true
      continue
    }
    if (!inEnabled) continue
    const item = line.match(/^\s*"([^"]+)"\s*,?\s*$/)
    if (item?.[1]) enabled.push(item[1])
    if (/^\s*\]\s*$/.test(line)) inEnabled = false
  }
  return enabled
}

function upsertPluginsEnabled(source: string, enabled: readonly string[]): string {
  const lines = source.split(/\r?\n/)
  const output: string[] = []
  let inPlugins = false
  let replacedEnabled = false
  let skippingEnabled = false

  for (const line of lines) {
    const section = line.match(/^\s*\[([^\]]+)\]\s*$/)
    if (section) {
      if (inPlugins && !replacedEnabled) {
        writeEnabled(output, enabled)
        replacedEnabled = true
      }
      inPlugins = section[1] === "plugins"
      skippingEnabled = false
      if (!inPlugins || replacedEnabled) output.push(line)
      continue
    }
    if (inPlugins && /^\s*enabled\s*=\s*\[/.test(line)) {
      skippingEnabled = true
      if (!replacedEnabled) {
        writeEnabled(output, enabled)
        replacedEnabled = true
      }
      continue
    }
    if (skippingEnabled) {
      if (/^\s*\]\s*$/.test(line)) skippingEnabled = false
      continue
    }
    output.push(line)
  }

  if (replacedEnabled) return output.join("\n")
  const body = output.join("\n").trimEnd()
  const addition = `[plugins]\n${renderEnabled(enabled).join("\n")}`
  return body ? `${body}\n\n${addition}` : addition
}

function writeEnabled(output: string[], enabled: readonly string[]): void {
  output.push(...renderEnabled(enabled))
}

function renderEnabled(enabled: readonly string[]): readonly string[] {
  return ["enabled = [", ...enabled.map((name) => `    ${tomlString(name)},`), "]"]
}

async function readConfigOrEmpty(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8")
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return ""
    throw error
  }
}

function tomlString(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`
}

function timestamp(): string {
  return new Date().toISOString().replaceAll(/[-:TZ.]/g, "").slice(0, 14)
}
