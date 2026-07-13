import { homedir } from "node:os"
import { join } from "node:path"
import type { ClaudeCodeInventoryOptions } from "./types"

export function resolveClaudeHome(options: ClaudeCodeInventoryOptions = {}): string {
  const env = options.env ?? process.env
  const fromOpt = options.claudeHome?.trim()
  if (fromOpt && fromOpt.length > 0) return fromOpt
  const fromEnv = env.CLAUDE_HOME?.trim() || env.CLAUDE_CONFIG_DIR?.trim()
  if (fromEnv && fromEnv.length > 0) return fromEnv
  const home = options.homeDir?.trim() || homedir()
  return join(home, ".claude")
}

export function resolveUserHome(options: ClaudeCodeInventoryOptions = {}): string {
  return options.homeDir?.trim() || options.env?.HOME?.trim() || homedir()
}

export function agentsSkillsDir(options: ClaudeCodeInventoryOptions = {}): string {
  return join(resolveUserHome(options), ".agents", "skills")
}

export function claudeUserSkillsDir(claudeHome: string): string {
  return join(claudeHome, "skills")
}

export function claudeProjectSkillsDir(projectRoot: string): string {
  return join(projectRoot, ".claude", "skills")
}

export function claudePluginsDir(claudeHome: string): string {
  return join(claudeHome, "plugins")
}

export function installedPluginsPath(claudeHome: string): string {
  return join(claudeHome, "plugins", "installed_plugins.json")
}

export function knownMarketplacesPath(claudeHome: string): string {
  return join(claudeHome, "plugins", "known_marketplaces.json")
}

export function claudeSettingsPath(claudeHome: string): string {
  return join(claudeHome, "settings.json")
}
