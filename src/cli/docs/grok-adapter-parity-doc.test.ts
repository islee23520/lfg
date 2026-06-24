import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const ROOT = fileURLToPath(new URL("../../../", import.meta.url))
const DEPRECATED_IDENTITY_COPY = new RegExp(
  [
    "not a Grok " + "plugin",
    "not a Grok " + "plugin/runtime",
    "setup helper/adapter " + "package only",
  ].join("|"),
)

describe("docs/grok-adapter-parity.md (plan task 1 + T5 contract)", () => {
  test("parity table has at least 10 capability rows", async () => {
    const text = await readFile(join(ROOT, "docs/grok-adapter-parity.md"), "utf8")
    const rows = text.split("\n").filter((line) => line.startsWith("|") && !line.includes("---") && !line.includes("omo-codex capability"))
    expect(rows.length).toBeGreaterThanOrEqual(10)
    expect(text).toContain("src/grok/")
    expect(text).toContain("GrokBuild port")
    expect(text).toContain("Grok Build plugin payload")
    expect(text).toContain("lfgIsPlugin: false")
    expect(text).toContain("not reported as a Grok plugin object")
    expect(text).toContain("setup --run")
    expect(text).toContain("~/.grok/plugins/lfg")
    expect(text).not.toMatch(DEPRECATED_IDENTITY_COPY)
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
    expect(text).toMatch(/\| OMO skill payload sync \|.*sync-omo-skills-to-grok\.mjs.*\| Implemented/)
    expect(text).toContain(".lfg-omo-skill-sync.json")
    expect(text).toContain("converts OpenAI agent metadata to `agents/grok.yaml`")
    expect(text).toContain("lfg-owned `lfg-doctor`, `lfg-report-bug`, and `lfg-contribute-bug-fix`")
    expect(text).toContain("not a claim that every deferred component runtime is behavior-adapted")
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
    expect(text).toContain("Scoped Grok-first OMO parity")
    expect(text).toContain("nativeAgentsStatus: \"missing\"")
    expect(text).toContain("Full native OMO agent behavioral parity is not claimed")
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
    expect(text).toContain("`lazycodex-ai` / OMO `v4.12.1`")
    expect(text).toContain("https://github.com/code-yeongyu/oh-my-openagent/releases/tag/v4.12.1")
    expect(text).toContain("split hook JSON files under `packages/omo-codex/plugin/hooks/`")
    expect(text).toContain("package-level MCP runtimes for")
    for (const [component, status] of [
      ["bootstrap", "Deferred"],
      ["auto-update", "Unsupported"],
      ["comment-checker", "Deferred"],
      ["git-bash", "Manifest-only"],
      ["rules", "Grok-adapted"],
      ["lsp", "Manifest-only"],
      ["ast_grep", "Manifest-only"],
      ["codegraph", "Grok-adapted"],
      ["grep_app", "Remote URL manifest-only"],
      ["context7", "Remote URL manifest-only"],
      ["ultrawork", "Grok-adapted"],
      ["ulw-loop", "Grok-adapted"],
      ["ulw-plan", "Grok-adapted"],
      ["start-work-continuation", "Deferred"],
      ["plan-mode-interception", "Deferred"],
      ["prompts-core", "Grok-adapted"],
      ["agent-builder", "Grok-adapted"],
      ["delegate-core", "Grok-adapted"],
      ["boulder-state", "Grok-adapted"],
      ["skills-loader-core", "Grok-adapted"],
      ["teammode", "Deferred"],
      ["lazycodex-executor-verify", "Deferred"],
      ["telemetry", "Unsupported"],
    ] as const) {
      expect(text).toMatch(new RegExp(`\\| \`${component}\` \\|.*\\| .*\\| .*\\| ${status} \\|`))
    }
    expect(text).toContain("`Implemented`, `Grok-adapted`, `Manifest-only`, `Remote URL manifest-only`, `Unsupported`, or `Deferred`")
    expect(text).toContain("macOS/non-Windows")
    expect(text).toContain("disabled_mcp_servers")
    expect(text).toContain("Windows-unverified")
    expect(text).toContain("codex_app.create_thread")
    expect(text).toContain("`lazycodex-executor`")
    expect(text).toContain("subagent-stop-verifying-lazycodex-executor-evidence.json")
    expect(text).toContain("src/grok/payload/component-inventory.ts")
    expect(text).toContain("hook-bridge.integration.test.ts")
    expect(text).toContain("sync-lazycodex-agents-to-grok.ts")
    expect(text).toContain("the durable continuation CLI is not packaged")
    expect(text).toContain("hook-time `additionalContext` guidance only")
    expect(text).not.toMatch(/\| `plan-mode-interception` \|.*\| (Implemented|Grok-adapted) \|/)
  })
})
