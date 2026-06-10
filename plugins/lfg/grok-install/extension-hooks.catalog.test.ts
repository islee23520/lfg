import { describe, expect, test } from "vitest"
import { normalizeHookCommandPaths } from "./normalize-plugin-hooks"

describe("hook path normalize (Grok plugin root)", () => {
  test("rewrites PLUGIN_ROOT to GROK_PLUGIN_ROOT", () => {
    const cmd = 'node "${PLUGIN_ROOT}/components/rules/dist/cli.js" hook session-start'
    expect(normalizeHookCommandPaths(cmd)).toBe(
      'node "${GROK_PLUGIN_ROOT}/components/rules/dist/cli.js" hook session-start',
    )
  })
})