import { describe, expect, test } from "vitest"
import { wrapLazyCodexHookCommand } from "./normalize-plugin-hooks"

describe("grok hook bridge wrapping", () => {
  test("wraps component node commands with bridge path", () => {
    const cmd =
      'node "${GROK_PLUGIN_ROOT}/components/rules/dist/cli.js" hook session-start'
    expect(wrapLazyCodexHookCommand(cmd)).toBe(
      'node "${GROK_PLUGIN_ROOT}/hooks/lfg-grok-hook-bridge.mjs" node "${GROK_PLUGIN_ROOT}/components/rules/dist/cli.js" hook session-start',
    )
  })

  test("leaves non-component commands unchanged", () => {
    const cmd = 'node -e "process.exit(0)"'
    expect(wrapLazyCodexHookCommand(cmd)).toBe(cmd)
  })
})
  test("wrap is idempotent: double-wrapped becomes single clean wrap", () => {
    const doubleWrapped =
      'node "${GROK_PLUGIN_ROOT}/hooks/lfg-grok-hook-bridge.mjs" node "${GROK_PLUGIN_ROOT}/hooks/lfg-grok-hook-bridge.mjs" node "${GROK_PLUGIN_ROOT}/components/rules/dist/cli.js" hook session-start'
    const once = wrapLazyCodexHookCommand(doubleWrapped)
    expect(once).toBe(
      'node "${GROK_PLUGIN_ROOT}/hooks/lfg-grok-hook-bridge.mjs" node "${GROK_PLUGIN_ROOT}/components/rules/dist/cli.js" hook session-start',
    )
    // applying again stays the same
    expect(wrapLazyCodexHookCommand(once)).toBe(once)
  })

  test("wrap is idempotent even with triple wrap", () => {
    const triple =
      'node "bridge" node "bridge" node "bridge" node "/real/components/foo/dist/cli.js" arg'
    const fixed = wrapLazyCodexHookCommand(triple)
    expect(fixed).toContain('node "bridge" node "/real/components/foo/dist/cli.js" arg')
    expect(fixed.split("lfg-grok-hook-bridge.mjs").length - 1).toBe(1) // only one occurrence of the bridge marker in the final string? Wait, the marker text appears once in the bridge path
  })
