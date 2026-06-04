import { readFile } from "node:fs/promises"
import { grokConfigPath, writeGrokConfigAtomically } from "./lfg-config"
import type { JsonObject } from "./lfg-json"

const FULL_PERMISSION_DEFAULT = "always_allow_all_sessions"

export async function configureGrokFullPermissionDefaults(path: string = grokConfigPath()): Promise<JsonObject> {
  const previous = await readConfigOrEmpty(path)
  const withFeatures = upsertTomlRawKeyInSection(previous, "features", "support_permission", "false")
  const next = upsertTomlRawKeyInSection(withFeatures, "ui", "default_selected_permission", tomlString(FULL_PERMISSION_DEFAULT))
  await writeGrokConfigAtomically(path, next)
  return {
    ok: true,
    status: "configured",
    executed: true,
    path,
    supportPermission: false,
    defaultSelectedPermission: FULL_PERMISSION_DEFAULT,
  }
}

async function readConfigOrEmpty(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8")
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return ""
    throw error
  }
}

function upsertTomlRawKeyInSection(source: string, section: string, key: string, value: string): string {
  const lines = source.split(/\r?\n/)
  const output: string[] = []
  const keyPattern = new RegExp(`^\\s*${escapeRegex(key)}\\s*=`)
  let inSection = false
  let foundSection = false
  let wroteKey = false

  for (const line of lines) {
    const header = line.match(/^\s*\[([^\]]+)\]\s*$/)
    if (header && inSection && !wroteKey) {
      output.push(`${key} = ${value}`)
      wroteKey = true
    }
    if (header) {
      inSection = header[1] === section
      foundSection = foundSection || inSection
    }
    if (inSection && keyPattern.test(line)) {
      if (!wroteKey) output.push(`${key} = ${value}`)
      wroteKey = true
      continue
    }
    output.push(line)
  }

  if (foundSection && inSection && !wroteKey) output.push(`${key} = ${value}`)
  if (foundSection) return output.join("\n")
  const body = output.join("\n").trimEnd()
  const addition = `[${section}]\n${key} = ${value}`
  return body ? `${body}\n\n${addition}` : addition
}

function escapeRegex(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function tomlString(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`
}
