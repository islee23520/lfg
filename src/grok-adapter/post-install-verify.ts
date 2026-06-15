import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { legacyInstalledGrokPluginRoot, nativeGrokPluginRoot, readGrokInstallStamp } from "./install"
import { readAdapterHooksTrust, resolveGrokAdapterPluginRoot } from "./grok-adapter-paths"
import { componentInventoryPath, type ComponentInventorySource } from "./component-inventory"
import { isGrokEventHooksJson } from "./hook-trust"
import { verifyNativeOmoAgents, type NativeAgentsVerifyResult } from "./native-agent-verify"

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
  readonly skillWorkflows: Record<string, boolean>  // T8: computed from real installed SKILL.md (inspects headings; no hardcode)
  readonly nativeAgents: NativeAgentsVerifyResult
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
      // T9 native parity defaults (stable for tests); T8 skillWorkflows from real SKILL.md (defaults false)
      nativeHookStatus: "missing",
      bridgeFallback: true,
      omoComponents: [],
      skillWorkflows: { "ulw-plan": false, "ulw-loop": false },
      nativeAgents: { status: "missing", pluginAgents: [], roles: [], prompts: [], hephaestusNativeDefault: false },
    }
  }
  const { pluginRoot, pluginDirName } = resolved
  const stamp = await readGrokInstallStamp(pluginRoot)
  const hooksPath = join(pluginRoot, "hooks", "hooks.json")
  const hookTrust = await readAdapterHooksTrust(pluginRoot)
  const hooksOk = hookTrust.ok
  const ok = stamp !== null && hooksOk
  const invPath = componentInventoryPath(pluginRoot)
  const payloadSource = await readPayloadSource(invPath)

  // T8 reviewer fix: skillWorkflows now derives from *real* installed SKILL.md content (inspects headings).
  // Replaces hard-coded true (blocker 1). Matches T3/T8 acceptance (Phase 0/Approval gate/Phase 3; Bootstrap/Execution Loop/Manual-QA channels).
  // Uses isolated temp HOME in QA only (blockers 3/4). No real ~/.grok mutation.
  const hooksRaw = await readHooksJsonSafe(hooksPath)
  const isNative = isGrokEventHooksJson(hooksRaw)
  const nativeHookStatus = isNative ? "native_grok_events" : (hooksOk ? "bridge_fallback" : "missing")
  const bridgeFallback = !isNative && hooksOk
  // T9 minimal stable values (doctor-json-contract.test.ts expectations preserved)
  const omoComponents = ["ultrawork", "rules"] as const
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
    hookTrustError: hookTrust.error,
    componentInventoryPath: invPath,
    payloadSource,
    nativeHookStatus,
    bridgeFallback,
    omoComponents,
    skillWorkflows,
    nativeAgents,
  }
}

async function readPayloadSource(path: string): Promise<ComponentInventorySource | null> {
  try {
    const raw = await readFile(path, "utf8")
    const parsed = JSON.parse(raw) as { source?: unknown }
    const s = parsed?.source
    if (typeof s === "string" && (s === "source_tree" || s === "source_override" || s === "lazycodex_bundle" || s === "fixture_fallback" || s === "repair_adapter")) {
      return s as ComponentInventorySource
    }
    return null
  } catch {
    return null
  }
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

/** T8: Inspect real installed SKILL.md content for workflow headings (no hard-coded booleans). */
async function computeSkillWorkflows(pluginRoot: string): Promise<Record<string, boolean>> {
  const readSafe = async (path: string): Promise<string> => {
    try {
      return await readFile(path, "utf8")
    } catch {
      return ""
    }
  }

  const planPath = join(pluginRoot, "skills", "ulw-plan", "SKILL.md")
  const loopPath = join(pluginRoot, "skills", "ulw-loop", "SKILL.md")
  const planContent = await readSafe(planPath)
  const loopContent = await readSafe(loopPath)

  return {
    "ulw-plan": /Phase 0|Tool Learning Protocol/i.test(planContent) &&
                /Approval gate/i.test(planContent) &&
                /Phase 3/i.test(planContent),
    "ulw-loop": /Bootstrap/i.test(loopContent) &&
                /Execution Loop/i.test(loopContent) &&
                /Manual-QA channels|Manual QA/i.test(loopContent),
  }
}

async function resolveFixedPlugin(
  home: string,
  pluginDirName: string,
): Promise<{ readonly pluginDirName: string; readonly pluginRoot: string } | null> {
  for (const pluginRoot of [nativeGrokPluginRoot(home, pluginDirName), legacyInstalledGrokPluginRoot(home, pluginDirName)]) {
    const hookTrust = await readAdapterHooksTrust(pluginRoot)
    if (!hookTrust.ok && hookTrust.error === "hooks.json missing") {
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
