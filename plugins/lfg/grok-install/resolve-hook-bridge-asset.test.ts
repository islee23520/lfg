import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"
import { resolveGrokHookBridgeAssetPath } from "./resolve-hook-bridge-asset"

describe("resolveGrokHookBridgeAssetPath", () => {
  test("finds bridge from grok-install module (source layout)", async () => {
    const path = await resolveGrokHookBridgeAssetPath(import.meta.url)
    expect(path).toContain("grok-install/assets/lfg-grok-hook-bridge.mjs")
  })

  test("finds bridge from dist/lfg.js bundle layout", async () => {
    const distLfg = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "lfg.js")
    const path = await resolveGrokHookBridgeAssetPath(distLfg)
    expect(path).toContain("grok-install/assets/lfg-grok-hook-bridge.mjs")
  })
})