import { INTERNAL_GROK_INSTALL_COMMAND } from "../../grok/install/run-grok-install"
import type { JsonObject } from "../../shared/json"

export function unsupportedCommand(positional: readonly string[]): JsonObject {
  const command = positional.join(" ") || "(empty)"
  return {
    ok: false,
    status: "error",
    code: "unsupported_command",
    command,
    message: `lfg does not run ${command}. Use "setup --run" (or "setup --run --force" to overwrite existing adapter).`,
    role: "omo_grok_installer",
    adapterPackage: "lfg-grok-install",
    installerCommand: INTERNAL_GROK_INSTALL_COMMAND,
    companionPackage: "lfg-grok-install",
    grokInstallerCommand: INTERNAL_GROK_INSTALL_COMMAND,
    lfpInstallerCommand: INTERNAL_GROK_INSTALL_COMMAND,
    lfgIsPlugin: false,
    supportedCommands: ["setup", "xai", "zai", "mcp", "ulw", "ulw-loop", "codex"],
  }
}
