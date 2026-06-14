import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const ROOT = fileURLToPath(new URL("../../..", import.meta.url))

describe("docs/grok-adapter-parity.md (plan task 1 + T5 contract)", () => {
  test("parity table has at least 10 capability rows", async () => {
    const text = await readFile(join(ROOT, "docs/grok-adapter-parity.md"), "utf8")
    const rows = text.split("\n").filter((line) => line.startsWith("|") && !line.includes("---") && !line.includes("omo-codex capability"))
    expect(rows.length).toBeGreaterThanOrEqual(10)
    expect(text).toContain("plugins/lfg/grok-install/")
    expect(text).toContain("grok-install/doctor.ts")
    expect(text).toContain("publishGap")
    expect(text).toContain("#22")
    expect(text).toContain("publish-owner-checklist")
    expect(text).toContain("plugin-cache-install.acceptance.test.ts")
    expect(text).toContain("#27")
    expect(text).toMatch(/\| Plugin cache install \|.*\| Implemented/)
    expect(text).toMatch(/\| Install version stamp \|.*\| Implemented/)
    expect(text).toContain("doctor-json-contract.test.ts")
    expect(text).toContain("#31")
    expect(text).toContain("hook-trust.acceptance.test.ts")
    expect(text).toContain("#28")
    expect(text).toContain("config-single-writer.acceptance.test.ts")
    expect(text).toMatch(/\| `config\.toml` merge \|.*\| Implemented/)
    expect(text).toContain("agent-tomls.acceptance.test.ts")
    expect(text).toContain("#30")
    expect(text).toContain("agent-overrides.test.ts")
    expect(text).toMatch(/\| Agent TOML \+ preserve reasoning \|.*\| Implemented/)
    expect(text).toMatch(/\| Extension agent overrides \(LFP port\) \|.*\| Implemented/)
    expect(text).toContain("publish-owner-checklist")
    expect(text).toContain("post-install-ported-hooks.test.ts")
    expect(text).toContain("#32")
    expect(text).toMatch(/\| Extension hooks \(LFP port\) \|.*\| Implemented/)
    expect(text).toMatch(/\| ulw-loop \/ start-work skills \|.*project `\.omo` ledger.*\| Implemented/)
    expect(text).toContain("no ledger tail/content")
    expect(text).toContain("malformed `.omo` fails closed")
    expect(text).toContain("registry-bin-publish-gap")
    expect(text).toContain("npm-publish-root-contract.test.ts")
    expect(text).toContain("setup-doctor-parity.test.ts")
    expect(text).toContain("lfg-project-local.test.ts")
    expect(text).toMatch(/\| Hook trust \|.*\| Implemented/)
    expect(text).toMatch(/\| Project-local `\.grok` repair \|.*\| N\/A/)
    expect(text).toContain("publish-gap-evidence-shape.test.ts")
    expect(text).toContain("doctor-pack-layout.acceptance.test.ts")
    expect(text).toContain("#25")
    expect(text).toMatch(/\| Internal verifier \|.*\| Implemented/)
    expect(text).toMatch(/\| `cleanup` \/ `update` \|.*\| N\/A/)
    expect(text).toContain("#34")
    expect(text).toMatch(/\| Model catalog \|.*\| Implemented/)
    expect(text).not.toMatch(/\| Plugin cache install \|.*\| partial/)
  })

  test("T5: forces mention of native Grok hooks, bridge fallback, and Grok-first OMO parity (failing-first contract)", async () => {
    const text = await readFile(join(ROOT, "docs/grok-adapter-parity.md"), "utf8")
    // These will fail until docs updated (verifier false-positive fix); tests pin exact new wording per T5
    expect(text).toContain("native Grok hooks")
    expect(text).toContain("bridge fallback")
    expect(text).toContain("Grok-first OMO parity")
    expect(text).toContain("native Grok hook")
    // Also pin full OMO + hook surfaces for package mapping
    expect(text).toContain("lfg-grok-hook-bridge.mjs")
    expect(text).toContain("Grok-native lifecycle")
    expect(text).toMatch(/native.*hook|hook.*native|bridge fallback|Grok-first.*OMO|OMO.*parity/i)
  })

  test("distinguishes core install parity from full OMO component parity for issue 36", async () => {
    const text = await readFile(join(ROOT, "docs/grok-adapter-parity.md"), "utf8")
    expect(text).toContain("## Core Install Parity")
    expect(text).toContain("## Full OMO Component Parity")
    expect(text).toContain("`lfg-component-inventory.json`")
    expect(text).toContain("`lazycodex-ai` / OMO `v4.9.2`")
    expect(text).toContain("https://github.com/code-yeongyu/oh-my-openagent/releases/tag/v4.9.2")
    for (const component of [
      "comment-checker",
      "git-bash",
      "rules",
      "lsp",
      "ast_grep",
      "ultrawork",
      "ulw-loop",
      "start-work-continuation",
      "telemetry",
    ] as const) {
      expect(text).toMatch(new RegExp(`\\| \`${component}\` \\|.*\\| .*\\| .*\\| (Implemented|Grok-adapted|Unsupported|Deferred|Windows-only) \\|`))
    }
    expect(text).toContain("plugins/lfg/grok-install/component-inventory.ts")
    expect(text).toContain("hook-bridge.integration.test.ts")
    expect(text).toContain("sync-lazycodex-agents-to-grok.ts")
  })
})
