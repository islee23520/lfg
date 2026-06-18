import { describe, expect, test } from "vitest"
import { findDeprecatedSetupJsonKeys } from "./setup-json-contract"
import { runLfg } from "./test-process"
import { INTERNAL_GROK_INSTALL_COMMAND } from "../grok-adapter/run-grok-install"

describe("setup plan JSON (ownership)", () => {
  test("planned setup advertises internal grok install not lfp npx", async () => {
    const result = await runLfg(["--json", "setup"], {})
    expect(result.exitCode).toBe(0)
    expect(result.json).toMatchObject({
      ok: true,
      status: "planned",
      executed: false,
      grokInstallerCommand: INTERNAL_GROK_INSTALL_COMMAND,
      lfgIsPlugin: false,
    })
    expect(JSON.stringify(result.json)).not.toContain("@islee23520/lfp")
    const steps = (result.json as { steps?: readonly { text: string }[] }).steps ?? []
    expect(steps.some((s) => s.text.includes(INTERNAL_GROK_INSTALL_COMMAND))).toBe(true)
    expect(JSON.stringify(result.json)).not.toContain("full OMO plugin surface")
    expect(JSON.stringify(result.json)).toContain("manifest-only MCP entries")
    expect(findDeprecatedSetupJsonKeys(result.json as Record<string, unknown>)).toEqual([])
  })
})
