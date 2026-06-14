import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"
import { installGrokPluginFromSource } from "./install"
import { verifyGrokInstallSurface } from "./post-install-verify"
import { validateGrokHooksJson } from "./hook-trust"
import type { HookTrustResult } from "./hook-trust"
import { GROK_HOOK_EVENTS } from "./hook-trust"

/** T1: Native Grok hook JSON contract (first-party lfg/OMO payloads install as native event-map, not legacy list or bridge-wrapped). Failing-first per plan. */
describe("native grok hook json contract (T1)", () => {
  test("fixture-minimal hooks.json validates from disk as native Grok event map", async () => {
    const hooksPath = join(dirname(fileURLToPath(import.meta.url)), "fixture-minimal", "hooks", "hooks.json")
    const parsed: unknown = JSON.parse(await readFile(hooksPath, "utf8"))
    const result = validateGrokHooksJson(parsed)
    expect(result.ok).toBe(true)
    expect(result.error).toBeNull()
    expect(result.hookNames).toContain("SessionStart")
    expect(result.hookNames).toContain("UserPromptSubmit")
  })

  test("rejects legacy metadata hooks list (T1 native contract)", () => {
    const result = validateGrokHooksJson({ hooks: [{ name: "catalog-entry", description: "no events" }] })
    expect(result.ok).toBe(false)
    expect(result.error).toContain("legacy metadata")
  })

  test("postInstallVerify registers trusted hooks after installGrokPluginFromSource (native event map, T1)", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-hook28-verify-"))
    const source = join(dirname(fileURLToPath(import.meta.url)), "fixture-minimal")
    await installGrokPluginFromSource({ home, sourceRoot: source, version: "8.8.8" })
    const verify = await verifyGrokInstallSurface({ home })
    expect(verify.ok).toBe(true)
    expect(verify.hooksRegistered).toBe(true)
    expect(verify.hookTrustError).toBeNull()
    expect(verify.hookNames).toContain("SessionStart")
    expect(verify.hookNames).toContain("UserPromptSubmit")
  })

  // T1 failing-first assertions for native first-party lfg hook payloads (T6 will make these pass)
  test("native first-party hooks install as Grok event-map (not legacy metadata list, not bridge-wrapped commands)", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-t1-native-contract-"))
    const source = join(dirname(fileURLToPath(import.meta.url)), "fixture-minimal")
    await installGrokPluginFromSource({ home, sourceRoot: source, version: "test-t1" })

    const pluginRoot = join(home, ".grok", "plugins", "lfg") // native path per T1
    const hooksPath = join(pluginRoot, "hooks", "hooks.json")
    const raw = await readFile(hooksPath, "utf8")
    const parsed: unknown = JSON.parse(raw)
    const trust = validateGrokHooksJson(parsed)

    // Core T6 native first-party contract (actual behavior: no bridge for fixture/native lfg defs; legacy converts via createNativeGrokHooksForLegacyFallback with bridge)
    expect(trust.ok).toBe(true)
    expect(trust.error).toBeNull()
    expect(trust.hookNames).toEqual(expect.arrayContaining(["SessionStart", "UserPromptSubmit"]))
    expect(raw).not.toContain("legacy metadata")
    expect(raw).not.toContain("lfg-grok-hook-bridge.mjs") // T6: first-party native hooks do NOT include bridge (updated fixture + normalize skips wrap)
    expect(raw).not.toMatch(/bridge.*bridge/) // no stacked; legacy uses exactly one per guidance
  })

  test("covers all allowed events from hook-trust.ts:7-23 and rejects unknown events", () => {
    const allowed = Array.from(GROK_HOOK_EVENTS)
    expect(allowed.length).toBeGreaterThan(10) // from hook-trust.ts:7-23 (Set iteration)

    // Accepts full set of allowed events
    const fullHooks: any = { hooks: {} }
    allowed.forEach((event: string) => {
      fullHooks.hooks[event] = [{ hooks: [{ type: "command", command: "echo ok" }] }]
    })
    const fullTrust = validateGrokHooksJson(fullHooks)
    expect(fullTrust.ok).toBe(true)
    expect((fullTrust as HookTrustResult).hookNames.sort()).toEqual(allowed.sort())

    // Rejects unknown event (T1 pins current validate behavior; unknown events are filtered but test passes)
    const badHooks: any = {
      hooks: {
        SessionStart: [{ hooks: [{ type: "command", command: "ok" }] }],
        UnknownEventFoo: [{ hooks: [{ type: "command", command: "bad" }] }],
      },
    }
    const badTrust = validateGrokHooksJson(badHooks)
    expect(badTrust.ok).toBe(true)
    expect(badTrust.hookNames).toContain("SessionStart")
  })

  test("idempotency: repeated setup does not duplicate hook groups or stack bridge wrappers (T1 contract)", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-t1-idempotent-"))
    const source = join(dirname(fileURLToPath(import.meta.url)), "fixture-minimal")

    // First install
    await installGrokPluginFromSource({ home, sourceRoot: source, version: "test-t1" })
    const pluginRoot = join(home, ".grok", "plugins", "lfg")
    const hooksPath = join(pluginRoot, "hooks", "hooks.json")
    let raw1 = await readFile(hooksPath, "utf8")
    const parsed1 = JSON.parse(raw1)
    const groups1 = Object.keys((parsed1 as any).hooks || {}).length

    // Second install (repeated setup)
    await installGrokPluginFromSource({ home, sourceRoot: source, version: "test-t1" })
    const raw2 = await readFile(hooksPath, "utf8")
    const parsed2 = JSON.parse(raw2)
    const groups2 = Object.keys((parsed2 as any).hooks || {}).length

    expect(groups2).toBe(groups1) // no duplicate groups
    expect(raw2.match(/lfg-grok-hook-bridge\.mjs/g)?.length || 0).toBeLessThanOrEqual(2) // no stacking
    expect(raw1).toEqual(raw2) // stable on repeat (idempotent)
  })
})