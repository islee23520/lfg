import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import { resolveLfgEnv, safeChildPath, validateSafeId } from "./env"

describe("runtime-ts foundation env", () => {
  test("resolves GROK_PLUGIN_ROOT and GROK_PLUGIN_DATA", () => {
    const env = resolveLfgEnv({ cwd: "/tmp/lfg-work", argv0: "ulw", env: { GROK_PLUGIN_ROOT: "/plugin", GROK_PLUGIN_DATA: "/state", LFG_LAUNCHER: "ulw" } })
    expect(env.root).toBe("/plugin")
    expect(env.data).toBe("/state")
    expect(env.launcher).toBe("ulw")
  })

  test("rejects unsafe ids and traversal", () => {
    expect(validateSafeId("sisyphus-junior")).toBe("sisyphus-junior")
    expect(() => validateSafeId("../bad")).toThrow()
    expect(safeChildPath("/tmp/root", "a", "b")).toBe(join("/tmp/root", "a", "b"))
    expect(() => safeChildPath("/tmp/root", "..", "escape")).toThrow()
  })
})
