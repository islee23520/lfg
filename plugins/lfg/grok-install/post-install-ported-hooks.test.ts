import { mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { LFG_PORTED_GROK_HOOKS } from "./extension-hooks"
import { validateGrokHooksJson } from "./hook-trust"
import { runInternalGrokInstall } from "./run-internal"
import { verifyGrokInstallSurface } from "./post-install-verify"

describe("post-install ported hooks (#32)", () => {
  test("internal install registers both lfg hook names", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-post-hooks-"))
    await runInternalGrokInstall({ HOME: home })
    const json = await verifyGrokInstallSurface({ home })
    expect(json.hookNames).toEqual(expect.arrayContaining(["lfg-visual-guidance", "lfg-agent-reminder"]))
    expect(json.hooksRegistered).toBe(true)
  })

  test("installed hooks.json parses and matches ported catalog", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-post-hooks-json-"))
    await runInternalGrokInstall({ HOME: home })
    const hooksPath = join(home, ".grok", "installed-plugins", "lazycodex", "hooks", "hooks.json")
    const parsed: unknown = JSON.parse(await readFile(hooksPath, "utf8"))
    const trust = validateGrokHooksJson(parsed)
    expect(trust.ok).toBe(true)
    const catalog = LFG_PORTED_GROK_HOOKS.map((h) => h.name)
    for (const name of catalog) {
      expect(trust.hookNames).toContain(name)
    }
  })
})