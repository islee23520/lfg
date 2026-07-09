import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const ROOT = fileURLToPath(new URL("../../../", import.meta.url))

describe("docs/omo-grokbuild-pi-agent-parity-adr.md", () => {
  test("pins matrix-first ADR and pi-agent proof boundaries", async () => {
    const text = await readFile(join(ROOT, "docs/omo-grokbuild-pi-agent-parity-adr.md"), "utf8")

    expect(text).toContain("matrix-first Architecture ADR with proof-first safeguards")
    expect(text).toContain("Host-native first")
    expect(text).toContain("adapter launch/auth proof only")
    expect(text).toContain("It never upgrades an OMO component to behavior parity by itself")
    expect(text).toContain("`pi-agent run`, external `pi`, or both")
    expect(text).toContain("repo adapter-route proof from external Pi runtime behavior proof")
    expect(text).toContain("Config Root Separation: `pi-agent run` vs `omo-senpi` / `senpi`")
    expect(text).toContain("`~/.grok` vs `~/.senpi`")
    expect(text).toContain("pi-agent run vs omo-senpi")
    expect(text).toContain("Config Root Separation section")
    expect(text).toContain("omo-senpi uses separate `~/.senpi`")

    for (const proofClass of [
      "behavior proof",
      "payload/skill usability proof",
      "manifest shape proof",
      "adapter launch/auth proof",
      "planned proof",
      "blocked/missing host surface",
      "impossible/not-applicable proof",
    ]) {
      expect(text).toContain(proofClass)
    }

    for (const component of [
      "comment-checker",
      "git-bash",
      "rules",
      "lsp",
      "ast_grep",
      "codegraph",
      "grep_app",
      "context7",
      "ultrawork",
      "ulw-loop",
      "ulw-plan",
      "ultimate-browsing",
      "bootstrap",
      "auto-update",
      "start-work-continuation",
      "prompts-core",
      "agent-builder",
      "delegate-core",
      "boulder-state",
      "skills-loader-core",
      "teammode",
      "lazycodex-executor-verify",
      "workflow-selector",
      "test-support",
      "telemetry",
      "plan-mode-interception",
    ]) {
      expect(text).toContain(`| \`${component}\` |`)
    }

    expect(text).toContain("pi-agent route/auth proof")
    expect(text).toContain("Does pi-agent emit an edit/post-tool lifecycle payload compatible with this hook?")
    expect(text).toContain("Does the actual Pi target read `~/.grok/plugins/lfg/skills`?")
    expect(text).toContain("Should `/ulw-plan`/ralplan remain the host-native planning path instead?")
    expect(text).toContain("If the parity table or inventory changes, run `npm run assert-omo-parity`")
  })
})
