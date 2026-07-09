import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const ROOT = fileURLToPath(new URL("../../../", import.meta.url))

describe("docs/grok-native-team-orchestration.md", () => {
  test("decision-complete Grok-native team orchestration design (checkbox 4 only)", async () => {
    const text = await readFile(join(ROOT, "docs/grok-native-team-orchestration.md"), "utf8")

    // Core status, scope, and invariants (exact match required for contract)
    expect(text).toContain("# Grok-Native Team Orchestration (Decision-Complete Design)")
    expect(text).toContain("**Status:** Decision-Complete (2026-07-09)")
    expect(text).toContain("checkbox 4")
    expect(text).toContain("todo 5")
    expect(text).toContain("`teammode` inventory status **remains Deferred** and MUST NOT be flipped to `Grok-adapted`")

    // Required mappings and phrases (verified against actual doc text)
    expect(text).toContain("OMO teammode members map directly to Grok `spawn_subagent`")
    expect(text).toContain("Durable state lives under `.omo/teams` using `team-core` concepts")
    expect(text).toContain("NO required `codex_app.*` tool names on Grok")
    expect(text).toContain("no codex_app.* tool names are required or referenced on the Grok surface")
    expect(text).toContain("When the Grok host lacks native persistent thread API support equivalent to `codex_app`, fall back to skill-only orchestration: durable state is still written to `.omo/teams` but member coordination is prompt-driven rather than subagent-spawned")
    expect(text).toContain("skill-only fallback when host lacks thread API")

    // Lead-facing tools and behaviors
    expect(text).toContain("Lead-facing tools: `create`/`list`/`message`/`status`/`shutdown`")
    expect(text).toContain("`team_create(name, description, members)`")
    expect(text).toContain("`team_list([filter])`")
    expect(text).toContain("`team_message(teamRunId, to, content)`")
    expect(text).toContain("`team_status(teamRunId)`")
    expect(text).toContain("`team_shutdown(teamRunId, force?)`")
    expect(text).toContain("Lead-facing tools (names + behaviors)")

    // team-core and state details
    expect(text).toContain("using `team-core` concepts")
    expect(text).toContain("`~/.omo/teams/{teamNameOrRunId}/`")
    expect(text).toContain("config.json")
    expect(text).toContain("state.json")
    expect(text).toContain("tasks/")
    expect(text).toContain("mailbox/")
    expect(text).toContain("`team-core` provides registry")
    expect(text).toContain("durable state under `.omo/teams` using team-core concepts")
    expect(text).toContain("registry + state-store")

    // Failure modes and fallback
    expect(text).toContain("Failure modes and skill-only fallback when host lacks thread API")
    expect(text).toContain("skill-only fallback")
    expect(text).toContain("`spawn_subagent` unavailable")
    expect(text).toContain("fail-closed")

    // Complements and links
    expect(text).toContain("grok-orchestration-plane.md")
    expect(text).toContain("grok-adapter-parity.md")
    expect(text).toContain("packages/team-core")
    expect(text).toContain("skills/teammode/SKILL.md")
    expect(text).toContain(".omo/evidence/task-4-lfg-next-release-app-server-epic.md")
    expect(text).toContain("spawn_subagent mapping")
    expect(text).toContain("delegate-core")
    expect(text).toContain("boulder-state")

    // Explicit negatives (no codex_app on Grok, no MVP, no status flip)
    expect(text).not.toContain("codex_app.create_thread")
    expect(text).not.toContain("codex_app.* tool names on Grok")
    expect(text).not.toContain("Grok has team API")
    expect(text).not.toContain("implements runtime MVP")
    expect(text).not.toContain("teammode is Grok-adapted")
    expect(text).not.toContain("teammode is now Grok-adapted")
    expect(text).toContain("**Explicit: NO required `codex_app.*` tool names on Grok**.")
    expect(text).toContain("NO required `codex_app.*` tool names on Grok")
    expect(text).toContain("remains Deferred")

    // Architecture decisions
    expect(text).toContain("**Lead** is always the **main Grok session**")
    expect(text).toContain("State is **inspectable by user**")
    expect(text).toContain("This design keeps lfg's Grok-first framing")
    expect(text).toContain("See `assert-omo-parity` gate for payload discipline")

    // Must stay in sync with parity (no status flip)
    expect(text).toContain("`teammode` inventory status **remains Deferred**")
  })
})
