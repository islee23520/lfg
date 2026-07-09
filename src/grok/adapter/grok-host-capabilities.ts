import { join } from "node:path"

import type { ModelDiscovery } from "../../cli/models/lfg-models"
import type { HostAdapterCapabilities, HostDiscoveredModel, HostMcpServerDefinition } from "../../core/adapter/host-capabilities"
import { GROK_HOOK_EVENTS } from "../hooks/hook-trust"
import { activeGrokHooksPath } from "../hooks/normalize-plugin-hooks-active"
import { LOCAL_MCP_SERVERS } from "../mcp/mcp-manifest-verify"
import { nativeGrokPluginRoot } from "../payload/install"

export function buildGrokHostAdapterCapabilities(
  homeDirectory: string,
  discovery: ModelDiscovery | null,
): HostAdapterCapabilities {
  const pluginDirectory = nativeGrokPluginRoot(homeDirectory)
  return {
    name: "grok",
    paths: {
      homeDirectory,
      configFile: join(homeDirectory, ".grok", "config.toml"),
      pluginDirectory,
      hooksFile: activeGrokHooksPath(pluginDirectory),
    },
    hooks: {
      supportedEvents: Array.from(GROK_HOOK_EVENTS).sort((a, b) => a.localeCompare(b)),
    },
    models: {
      ...(discovery === null ? {} : { discoveryEndpoint: discovery.modelsUrl }),
      discoveredModels: toDiscoveredModels(discovery),
    },
    mcp: {
      runtimeRoot: join(pluginDirectory, "mcp-runtimes"),
      servers: localMcpServers(pluginDirectory),
      materializations: LOCAL_MCP_SERVERS.map((server) => ({
        name: server.name,
        sourceDirectory: join(pluginDirectory, "components", server.componentDir),
        targetDirectory: join(pluginDirectory, "mcp-runtimes", server.runtimeDir),
      })),
    },
    skills: {
      roots: [
        { name: "plugin", directory: join(pluginDirectory, "skills") },
        { name: "user", directory: join(homeDirectory, ".grok", "skills") },
      ],
    },
    agents: {
      promptRoot: join(homeDirectory, ".grok", "prompts", "omo"),
      installRoot: join(homeDirectory, ".grok", "agents"),
    },
  }
}

function toDiscoveredModels(discovery: ModelDiscovery | null): readonly HostDiscoveredModel[] {
  if (discovery === null) return []
  return discovery.modelIds.map((id) => ({ provider: modelProvider(id), id }))
}

function modelProvider(modelId: string): string {
  const separator = modelId.indexOf("/")
  return separator === -1 ? "unknown" : modelId.slice(0, separator)
}

function localMcpServers(pluginDirectory: string): readonly HostMcpServerDefinition[] {
  return LOCAL_MCP_SERVERS.map((server) => ({
    name: server.name,
    command: "node",
    args: [join(pluginDirectory, "mcp-runtimes", server.runtimeDir, "dist", "cli.js"), "mcp"],
  }))
}
