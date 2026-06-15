import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { validateGrokHooksJson } from "./hook-trust"
import { runInternalGrokInstall } from "./run-internal"
import { verifyGrokInstallSurface } from "./post-install-verify"

describe("post-install ported hooks (#32)", () => {
  test("repair on lazycodex-ai-shaped tree registers Grok hook events", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-post-hooks-"))
    const pluginRoot = join(home, ".grok", "plugins", "lfg")
    await mkdir(join(pluginRoot, "hooks"), { recursive: true })
    await mkdir(join(pluginRoot, "components", "rules", "dist"), { recursive: true })
    await writeFile(
      join(pluginRoot, "hooks", "hooks.json"),
      `${JSON.stringify(
        {
          hooks: {
            SessionStart: [
              {
                hooks: [
                  {
                    type: "command",
                    command: 'node "${PLUGIN_ROOT}/components/rules/dist/cli.js" hook session-start',
                    timeout: 5,
                  },
                ],
              },
            ],
          },
        },
        null,
        2,
      )}\n`,
    )
    // Write our stamp so this is recognized as a tree we own → triggers clean repair path
    // (mergePortedHooksIntoPlugin) instead of full re-install from fixture.
    await writeFile(
      join(pluginRoot, "lfg-install.json"),
      `${JSON.stringify({ packageName: "@islee23520/lfg", version: "test", platform: "grok" }, null, 2)}\n`,
    )
    await runInternalGrokInstall({ HOME: home })
    const json = await verifyGrokInstallSurface({ home })
    expect(json.hookNames).toEqual([
      "Notification",
      "PostToolUse",
      "PreCompact",
      "PreToolUse",
      "SessionStart",
      "Stop",
      "SubagentStart",
      "SubagentStop",
      "UserPromptSubmit",
    ])
    expect(json.hooksRegistered).toBe(true)
    const raw = await readFile(join(pluginRoot, "hooks", "hooks.json"), "utf8")
    expect(raw).toContain("GROK_PLUGIN_ROOT")
    expect(await readFile(join(pluginRoot, "hooks", "lfg-project-omo-ledger.mjs"), "utf8")).toContain("inspectProjectOmoLedger")
  })

  test("installed hooks.json parses as Grok event map", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-post-hooks-json-"))
    await runInternalGrokInstall({ HOME: home })
    const hooksPath = join(home, ".grok", "plugins", "lfg", "hooks", "hooks.json")
    const parsed: unknown = JSON.parse(await readFile(hooksPath, "utf8"))
    const trust = validateGrokHooksJson(parsed)
    expect(trust.ok).toBe(true)
    expect(trust.hookNames).toContain("SessionStart")
  })
})