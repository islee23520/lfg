import { existsSync } from "node:fs"
import { join } from "node:path"
import { LAZYCODEX_INSTALLER_COMMAND } from "./lfg-installer"
import type { JsonObject } from "./lfg-json"

export const SUPPORTED_COMMANDS = ["install", "status", "doctor", "config grok-byok", "lazycodex install", "lazycodex status", "setup install-plan", "setup show"] as const

export function unsupportedCommand(positional: readonly string[]): JsonObject {
  const command = positional.join(" ") || "(empty)"
  return {
    ok: false,
    status: "error",
    code: "unsupported_command",
    command,
    message: `lfg does not run ${command}; it installs the lazycodex Codex adapter for grok-build.`,
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
