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
    expect(text).toContain("including `ultimate-browsing` with its references/engine/scripts")
    expect(text).toContain(".lfg-omo-skill-sync.json")
    expect(text).toContain("converts OpenAI agent metadata to `agents/grok.yaml`")
    expect(text).toContain("lfg-owned `lfg-doctor`, `lfg-report-bug`, and `lfg-contribute-bug-fix`")
    expect(text).toContain("not a claim that every deferred component runtime or stealth-browser surface is behavior-adapted")
    expect(text).toMatch(/\| `ultimate-browsing` \|.*skills\/ultimate-browsing.*\| Implemented/)
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
    expect(text).toContain("## Current Parity Score")
    expect(text).toContain("Current score after T2/T4/T5: **88/100**")
    expect(text).toContain("automatic LSP lifecycle hook reinjection remain unclaimed")
    expect(text).toContain("## Full OMO Component Parity")
    expect(text).toContain("`lfg-component-inventory.json`")
    expect(text).toContain("`lazycodex-ai` / OMO `v4.13.0`")
    expect(text).toContain("https://github.com/code-yeongyu/oh-my-openagent/releases/tag/v4.13.0")
    expect(text).toContain("split hook JSON files under `packages/omo-codex/plugin/hooks/`")
    expect(text).toContain("package-level MCP runtimes for")
    expect(text).toContain("scripts/omo-parity-upkeep.mjs")
    expect(text).toContain("unclassified upstream skill, component, or hook-referenced component")
    for (const [component, status] of [
      ["bootstrap", "Deferred"],
      ["auto-update", "Unsupported"],
      ["comment-checker", "Grok-adapted"],
      ["git-bash", "Manifest-only"],
      ["rules", "Grok-adapted"],
      ["lsp", "Grok-adapted"],
      ["ast_grep", "Grok-adapted"],
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
      ["workflow-selector", "Deferred"],
      ["telemetry", "Unsupported"],
      ["test-support", "Unsupported"],
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
    expect(text).toContain("user-prompt-submit-selecting-workflow.json")
    expect(text).toContain("OMO_CODEX_AUTO_WORKFLOW")
    expect(text).toContain("Upstream package test infrastructure remains Unsupported")
    expect(text).toContain("test-only support code outside the Grok runtime payload")
    expect(text).toContain("src/grok/payload/component-inventory.ts")
    expect(text).toContain("`src/core/omo/rules-engine`")
    expect(text).toContain("`src/core/omo/prompts-core`")
    expect(text).toContain("`src/core/omo/agent-builder`")
    expect(text).toContain("`src/core/omo/delegate-core`")
    expect(text).toContain("`src/core/omo/boulder-state`")
    expect(text).toContain("`src/core/omo/skills-loader-core`")
    expect(text).not.toContain("`src/grok/ports/vendor/prompts-core-vendored/`")
    expect(text).not.toContain("`src/grok/ports/vendor/agent-builder-vendored/`")
    expect(text).not.toContain("`src/grok/ports/vendor/delegate-core-vendored/`")
    expect(text).not.toContain("`src/grok/ports/vendor/boulder-state-vendored/`")
    expect(text).not.toContain("`src/grok/ports/vendor/skills-loader-core-vendored/`")
    expect(text).toContain("T2-comment-checker-runtime.txt")
    expect(text).toContain("T4-ast-grep-runtime.txt")
    expect(text).toContain("T5-lsp-runtime.txt")
    expect(text).toContain("hooks/lfg-native-comment-checker.mjs")
    expect(text).toContain("ast_grep_search")
    expect(text).toContain("typescript_diagnostics")
    expect(text).toContain("hook-bridge.integration.test.ts")
    expect(text).toContain("sync-lazycodex-agents-to-grok.ts")
    expect(text).toContain("the durable continuation CLI is not packaged")
    expect(text).toContain("hook-time `additionalContext` guidance only")
    expect(text).toContain("workflow-selector`, `teammode`, `lazycodex-executor-verify`, `start-work-continuation`")
    expect(text).toContain("Deferred for automatic lifecycle hook reinjection")
    // refreshed for task 3 of orchestration epic
    expect(text).toContain("host dependency class")
    expect(text).toContain("codex_app")
    expect(text).toContain("Stop/SubagentStop hook")
    expect(text).toContain("missing host surface")
    expect(text).toContain("grok-orchestration-plane.md")
    expect(text).not.toMatch(/\| `plan-mode-interception` \|.*\| (Implemented|Grok-adapted) \|/)
    expect(text).not.toMatch(/\| `workflow-selector` \|.*\| (Implemented|Grok-adapted) \|/)
    expect(text).not.toMatch(/\| `teammode` \|.*\| (Implemented|Grok-adapted) \|/)
    expect(text).not.toMatch(/\| `lazycodex-executor-verify` \|.*\| (Implemented|Grok-adapted) \|/)
    expect(text).not.toMatch(/\| `start-work-continuation` \|.*\| (Implemented|Grok-adapted) \|/)
  })
})
