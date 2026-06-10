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