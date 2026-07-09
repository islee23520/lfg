export type HostJson =
  | null
  | boolean
  | number
  | string
  | readonly HostJson[]
  | { readonly [key: string]: HostJson }

export type HostEnvironment = {
  readonly [name: string]: string | undefined
}

export type HostPathsCapability = {
  readonly homeDirectory: string
  readonly configFile: string
  readonly pluginDirectory: string
  readonly hooksFile: string
}

export type HostHookEventName = string

export type HostHookEvent = {
  readonly name: HostHookEventName
  readonly payload: HostJson
}

export type HostHooksCapability = {
  readonly supportedEvents: readonly HostHookEventName[]
}

export type HostDiscoveredModel = {
  readonly provider: string
  readonly id: string
  readonly displayName?: string
}

export type HostModelDiscoveryCapability = {
  readonly discoveryEndpoint?: string
  readonly discoveredModels: readonly HostDiscoveredModel[]
}

export type HostMcpServerDefinition = {
  readonly name: string
  readonly command: string
  readonly args: readonly string[]
  readonly env?: HostEnvironment
}

export type HostMcpRuntimeMaterialization = {
  readonly name: string
  readonly sourceDirectory: string
  readonly targetDirectory: string
}

export type HostMcpRuntimeCapability = {
  readonly runtimeRoot: string
  readonly servers: readonly HostMcpServerDefinition[]
  readonly materializations: readonly HostMcpRuntimeMaterialization[]
}

export type HostSkillRoot = {
  readonly name: string
  readonly directory: string
}

export type HostSkillRootsCapability = {
  readonly roots: readonly HostSkillRoot[]
}

export type HostAgentPromptInstallCapability = {
  readonly promptRoot: string
  readonly installRoot: string
}

export interface HostAdapterCapabilities {
  readonly name: string
  readonly paths: HostPathsCapability
  readonly hooks: HostHooksCapability
  readonly models: HostModelDiscoveryCapability
  readonly mcp: HostMcpRuntimeCapability
  readonly skills: HostSkillRootsCapability
  readonly agents: HostAgentPromptInstallCapability
}
