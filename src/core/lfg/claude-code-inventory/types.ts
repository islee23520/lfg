/** Claude Code plugin + skill inventory types (host-neutral; no Grok imports). */

export type ClaudeSkillSource =
  | "claude-user"
  | "claude-project"
  | "agents-shared"
  | "plugin-marketplace"
  | "plugin-installed"

export type ClaudeSkillInfo = {
  readonly name: string
  readonly dirName: string
  readonly path: string
  readonly description: string | null
  readonly source: ClaudeSkillSource
  readonly marketplace: string | null
  readonly plugin: string | null
  readonly hasReferences: boolean
  readonly hasScripts: boolean
}

export type ClaudePluginInfo = {
  readonly name: string
  readonly description: string | null
  readonly version: string | null
  readonly author: string | null
  readonly path: string
  readonly marketplace: string | null
  readonly sourceKind: "marketplace" | "installed" | "enabled"
  readonly enabled: boolean
  readonly skillCount: number
  readonly skills: readonly string[]
  readonly keywords: readonly string[]
}

export type ClaudeMarketplaceInfo = {
  readonly id: string
  readonly installLocation: string | null
  readonly lastUpdated: string | null
  readonly sourceLabel: string | null
  readonly pluginCount: number
}

export type ClaudeCodeInventory = {
  readonly ok: true
  readonly status: "claude_code_inventory"
  readonly claudeHome: string
  readonly claudeHomeExists: boolean
  readonly skills: readonly ClaudeSkillInfo[]
  readonly plugins: readonly ClaudePluginInfo[]
  readonly marketplaces: readonly ClaudeMarketplaceInfo[]
  readonly skillCount: number
  readonly pluginCount: number
  readonly marketplaceCount: number
  readonly enabledPluginCount: number
  /** Settings keys only — never secret values. */
  readonly settings: {
    readonly path: string | null
    readonly exists: boolean
    readonly model: string | null
    readonly enabledPluginIds: readonly string[]
    readonly envKeys: readonly string[]
    readonly permissionDefaultMode: string | null
  }
}

export type ClaudeCodeInventoryOptions = {
  readonly claudeHome?: string
  readonly projectRoot?: string
  readonly includeAgentsSkills?: boolean
  readonly includeMarketplacePlugins?: boolean
  readonly includeMarketplaceSkills?: boolean
  readonly env?: Readonly<Record<string, string | undefined>>
  readonly homeDir?: string
}
