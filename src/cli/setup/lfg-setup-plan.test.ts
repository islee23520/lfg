import { describe, expect, test } from "vitest"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { findDeprecatedSetupJsonKeys } from "../setup-json-contract"
import { runLfg } from "../test/test-process"
import { INTERNAL_GROK_INSTALL_COMMAND } from "../../grok/install/run-grok-install"

describe("setup plan JSON (ownership)", () => {
  test("planned setup advertises internal grok install not lfp npx", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-setup-plan-home-"))
    const result = await runLfg(["--json", "setup"], { HOME: home })
    expect(result.exitCode).toBe(0)
    expect(result.json).toMatchObject({
      ok: true,
      status: "planned",
      executed: false,
      grokInstallerCommand: INTERNAL_GROK_INSTALL_COMMAND,
      lfgIsPlugin: false,
      codingToolAdapter: {
        selected: "grok",
        default: "grok",
        supported: ["grok"],
        contract: {
          id: "grok",
          command: "grok",
        },
        contracts: {
          grok: {
            command: "grok",
            fallbackAdapter: null,
          },
        },
      },
      backendEngine: {
        selected: "grok",
        default: "grok",
        supported: ["grok", "codex"],
      },
    })
    expect(JSON.stringify(result.json)).not.toContain("@islee23520/lfp")
    const steps = (result.json as { steps?: readonly { text: string }[] }).steps ?? []
    expect(steps.some((s) => s.text.includes(INTERNAL_GROK_INSTALL_COMMAND))).toBe(true)
    expect(JSON.stringify(result.json)).not.toContain("full OMO plugin surface")
    expect(JSON.stringify(result.json)).toContain("manifest-only MCP entries")
    expect(findDeprecatedSetupJsonKeys(result.json as Record<string, unknown>)).toEqual([])
  })
})
