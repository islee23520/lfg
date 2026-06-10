import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { installGrokPluginFromSource } from "./install"
import { mergePortedHooksIntoPlugin } from "./extension-hooks"

describe("extension-hooks", () => {
  test("normalize rewrites PLUGIN_ROOT in installed tree", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-ext-hooks-"))
    const source = join(import.meta.dirname, "fixture-minimal")
    const { pluginRoot } = await installGrokPluginFromSource({ home, sourceRoot: source })
    const hooksPath = join(pluginRoot, "hooks", "hooks.json")
    const withLegacy = {
      hooks: {
        UserPromptSubmit: [
          {
            hooks: [
              {
                type: "command",
                command: 'node "${PLUGIN_ROOT}/components/ultrawork/dist/cli.js" hook user-prompt-submit',
                timeout: 5,
              },
            ],
          },
        ],
      },
    }
    await writeFile(hooksPath, `${JSON.stringify(withLegacy, null, 2)}\n`, "utf8")
    await mergePortedHooksIntoPlugin(pluginRoot)
    const raw = await readFile(hooksPath, "utf8")
    expect(raw).toContain("${GROK_PLUGIN_ROOT}")
    expect(raw).not.toContain("${PLUGIN_ROOT}")
    expect(raw).toContain("lfg-grok-hook-bridge.mjs")
  })

  test("second merge is stable (idempotent)", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-ext-hooks-idem-"))
    const source = join(import.meta.dirname, "fixture-minimal")
    const { pluginRoot } = await installGrokPluginFromSource({ home, sourceRoot: source })
    await mergePortedHooksIntoPlugin(pluginRoot)
    const first = await readFile(join(pluginRoot, "hooks", "hooks.json"), "utf8")
    await mergePortedHooksIntoPlugin(pluginRoot)
    const second = await readFile(join(pluginRoot, "hooks", "hooks.json"), "utf8")
    expect(second).toBe(first)
  })
})