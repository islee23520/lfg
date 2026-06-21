import { access, readFile } from "node:fs/promises"
import { join } from "node:path"
import { legacyInstalledGrokPluginRoot, nativeGrokPluginRoot, readGrokInstallStamp } from "./install"
import { readAdapterHooksTrust, resolveGrokAdapterPluginRoot } from "./grok-adapter-paths"
import { componentInventoryPath, type ComponentInventorySource } from "./component-inventory"
import { isGrokEventHooksJson } from "./hook-trust"
import { verifyNativeOmoAgents, type NativeAgentsVerifyResult } from "./native-agent-verify"
import { verifyPluginMcpManifest, type McpVerificationResult } from "./materialize-grok-mcp"
import { computeSkillWorkflows } from "./skill-workflow-verify"
import { activeGrokHooksPath } from "./normalize-plugin-hooks-active"

export type PostInstallVerifyOptions = {
  readonly home: string
  readonly pluginDirName?: string
}

export type PostInstallVerifyResult = {
  readonly ok: boolean
  readonly status: "verified" | "missing_adapter"
  readonly pluginDirName: string
  readonly pluginRoot: string
  readonly stamp: { readonly packageName: string; readonly version: string } | null
  readonly hooksPath: string | null
  readonly hooksRegistered: boolean
  readonly hookNames: readonly string[]
  readonly hookTrustError: string | null
  readonly componentInventoryPath: string | null
  readonly payloadSource: ComponentInventorySource | null
  /** T9: native parity reporting for doctor/post-install (stable field names) */
  readonly nativeHookStatus: "native_grok_events" | "bridge_fallback" | "missing"
  readonly bridgeFallback: boolean
  readonly omoComponents: readonly string[]
  readonly skillWorkflows: Record<string, boolean>
  readonly nativeAgents: NativeAgentsVerifyResult
  readonly mcpVerification: McpVerificationResult
}

/** Same resolution as doctor: adapter under ~/.grok/plugins/lfg or lazycodex. */
export async function verifyGrokInstallSurface(options: PostInstallVerifyOptions): Promise<PostInstallVerifyResult> {
  const resolved =
    options.pluginDirName === undefined
      ? await resolveGrokAdapterPluginRoot(options.home)
      : await resolveFixedPlugin(options.home, options.pluginDirName)
  if (resolved === null) {
    const pluginDirName = options.pluginDirName ?? "lfg"
    const pluginRoot = nativeGrokPluginRoot(options.home, pluginDirName)
    return {
      ok: false,
      status: "missing_adapter",
      pluginDirName,
      pluginRoot,
      stamp: null,
      hooksPath: null,
      hooksRegistered: false,
      hookNames: [],
      hookTrustError: "adapter plugin tree not found",
      componentInventoryPath: null,
      payloadSource: null,
      nativeHookStatus: "missing",
      bridgeFallback: true,
      omoComponents: [],
      skillWorkflows: { "ulw-plan": false, "ulw-loop": false, "start-work": false },
      nativeAgents: { status: "missing", pluginAgents: [], roles: [], prompts: [], sisyphusDefaultAgent: false, hephaestusPromptPresent: false },
      mcpVerification: missingMcpVerification(pluginRoot, "adapter plugin tree not found"),
    }
  }
  const { pluginRoot, pluginDirName } = resolved
  const stamp = await readGrokInstallStamp(pluginRoot)
  const hooksPath = activeGrokHooksPath(pluginRoot)
  const hookTrust = await readAdapterHooksTrust(pluginRoot)
  const hooksRaw = await readHooksJsonSafe(hooksPath)
  const hookTargetErrors = hookTrust.ok ? await verifyHookCommandTargets(pluginRoot, hooksRaw) : []
  const hooksOk = hookTrust.ok && hookTargetErrors.length === 0
  const mcpVerification = await verifyPluginMcpManifest(pluginRoot)
  const ok = stamp !== null && hooksOk && mcpVerification.ok
  const invPath = componentInventoryPath(pluginRoot)
  const inventory = await readInventorySummary(invPath)

  const isNative = isGrokEventHooksJson(hooksRaw)
  const nativeHookStatus = isNative ? "native_grok_events" : (hooksOk ? "bridge_fallback" : "missing")
  const bridgeFallback = !isNative && hooksOk
  const omoComponents = inventory.componentIds
  const skillWorkflows = await computeSkillWorkflows(pluginRoot)
  const nativeAgents = await verifyNativeOmoAgents(pluginRoot, options.home)

  return {
    ok,
    status: ok ? "verified" : "missing_adapter",
    pluginDirName,
    pluginRoot,
    stamp,
    hooksPath,
    hooksRegistered: hooksOk,
    hookNames: hookTrust.hookNames,
    hookTrustError: hookTrust.error ?? (hookTargetErrors.length > 0 ? hookTargetErrors.join("; ") : null),
    componentInventoryPath: invPath,
    payloadSource: inventory.payloadSource,
    nativeHookStatus,
    bridgeFallback,
    omoComponents,
    skillWorkflows,
    nativeAgents,
    mcpVerification,
  }
}

function missingMcpVerification(pluginRoot: string, error: string): McpVerificationResult {
  return {
    ok: false,
    manifestPath: join(pluginRoot, ".mcp.json"),
    expectedServers: ["ast_grep", "grep_app", "context7", "git_bash", "lsp"],
    localServers: ["ast_grep", "git_bash", "lsp"],
    remoteServers: ["grep_app", "context7"],
    disabledServers: [],
    remoteLiveCalls: false,
    gitBash: "misconfigured",
    windowsExecution: "unverified_no_windows_runner",
    errors: [error],
  }
}

type InventorySummary = {
  readonly payloadSource: ComponentInventorySource | null
  readonly componentIds: readonly string[]
}

async function readInventorySummary(path: string): Promise<InventorySummary> {
  try {
    const raw = await readFile(path, "utf8")
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return { payloadSource: null, componentIds: [] }
    }
    const record = parsed as { readonly source?: unknown; readonly components?: unknown }
    const source = parsePayloadSource(record.source)
    const componentIds = parseInventoryComponentIds(record.components)
    return { payloadSource: source, componentIds }
  } catch {
    return { payloadSource: null, componentIds: [] }
  }
}

function parsePayloadSource(source: unknown): ComponentInventorySource | null {
  if (
    source === "source_tree" ||
    source === "source_override" ||
    source === "omo_native_bundle" ||
    source === "lazycodex_bundle" ||
    source === "fixture_fallback" ||
    source === "repair_adapter"
  ) {
    return source
  }
  return null
}

function parseInventoryComponentIds(components: unknown): readonly string[] {
  if (!Array.isArray(components)) {
    return []
  }
  const ids: string[] = []
  for (const component of components) {
    if (typeof component !== "object" || component === null || Array.isArray(component)) {
      continue
    }
    const id = (component as { readonly id?: unknown }).id
    if (typeof id === "string" && id.length > 0) {
      ids.push(id)
    }
  }
  return ids
}

/** Safe read for T9 nativeHookStatus determination (avoids throwing on missing hooks.json). */
async function readHooksJsonSafe(path: string): Promise<unknown> {
  try {
    const raw = await readFile(path, "utf8")
    return JSON.parse(raw)
  } catch {
    return null
  }
}

async function verifyHookCommandTargets(pluginRoot: string, hooksRaw: unknown): Promise<readonly string[]> {
  if (typeof hooksRaw !== "object" || hooksRaw === null || Array.isArray(hooksRaw)) return []
  const hooks = (hooksRaw as { readonly hooks?: unknown }).hooks
  if (typeof hooks !== "object" || hooks === null || Array.isArray(hooks)) return []
  const errors: string[] = []
  for (const groups of Object.values(hooks as Record<string, unknown>)) {
    if (!Array.isArray(groups)) continue
    for (const group of groups) {
      if (typeof group !== "object" || group === null) continue
      const handlers = (group as { readonly hooks?: unknown }).hooks
      if (!Array.isArray(handlers)) continue
      for (const handler of handlers) {
        if (typeof handler !== "object" || handler === null) continue
        const record = handler as { readonly type?: unknown; readonly command?: unknown }
        if (record.type !== "command" || typeof record.command !== "string") continue
        for (const target of hookCommandTargets(pluginRoot, record.command)) {
          try {
            await access(target)
          } catch (error) {
            if (!(error instanceof Error)) throw error
            errors.push(`missing hook command target: ${target}`)
          }
        }
      }
    }
  }
  return errors
}

function hookCommandTargets(pluginRoot: string, command: string): readonly string[] {
  const targets: string[] = []
  for (const match of command.matchAll(/"([^"]+)"|(\S+)/g)) {
    const token = match[1] ?? match[2] ?? ""
    const path = token.replace(/\$\{GROK_PLUGIN_ROOT\}|\$\{PLUGIN_ROOT\}/g, pluginRoot)
    if (path.startsWith(`${pluginRoot}/`) || path === pluginRoot) {
      targets.push(path)
    }
  }
  return targets
}

async function resolveFixedPlugin(
  home: string,
  pluginDirName: string,
): Promise<{ readonly pluginDirName: string; readonly pluginRoot: string } | null> {
  for (const pluginRoot of [nativeGrokPluginRoot(home, pluginDirName), legacyInstalledGrokPluginRoot(home, pluginDirName)]) {
    const hookTrust = await readAdapterHooksTrust(pluginRoot)
    if (!hookTrust.ok && hookTrust.error === "global lfg-hooks.json missing") {
      try {
        await readFile(join(pluginRoot, "lfg-install.json"), "utf8")
        return { pluginDirName, pluginRoot }
      } catch {
        continue
      }
    }
    if (hookTrust.ok || (await readGrokInstallStamp(pluginRoot)) !== null) {
      return { pluginDirName, pluginRoot }
    }
  }
  return (await resolveGrokAdapterPluginRoot(home)) ?? null
}
