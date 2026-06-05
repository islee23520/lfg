import { existsSync } from "node:fs"
import { join } from "node:path"
import { LAZYCODEX_INSTALLER_COMMAND } from "./lfg-installer"
import type { JsonObject } from "./lfg-json"

export const SUPPORTED_COMMANDS = ["setup", "doctor", "dry-setup"] as const

export function unsupportedCommand(positional: readonly string[]): JsonObject {
  const command = positional.join(" ") || "(empty)"
  return {
    ok: false,
    status: "error",
    code: "unsupported_command",
    command,
    message: `lfg does not run ${command}; use setup, doctor, or dry-setup for the lazycodex Codex adapter installer.`,
    role: "lazycodex_adapter_installer",
    adapterPackage: "lazycodex-ai",
    installerCommand: LAZYCODEX_INSTALLER_COMMAND,
    lfgIsPlugin: false,
    supportedCommands: [...SUPPORTED_COMMANDS],
  }
}

export function commandPath(exe: string): string | null {
  const pathValue = process.env.PATH ?? ""
  for (const dir of pathValue.split(":")) {
    const candidate = join(dir, exe)
    if (existsSync(candidate)) return candidate
  }
  return null
}
