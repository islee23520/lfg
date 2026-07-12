# Changelog

All notable changes to `@islee23520/lfg` are documented here.

Format: Keep Unreleased notes until a version tag; GitHub Release notes may also auto-generate from commits.

## [Unreleased]

### Model defaults
- Prefer **grok-4.5** as primary in recommendation/default/sisyphus chains when available.
- Bundled **default** and **sisyphus** agent overrides use `model_reasoning_effort = low` (frontier Grok is strong enough at low effort for orchestration).

### Host built-ins
- Keep Grok host `explore` / `general-purpose` **enabled** (no longer force-disabled).
- Prefer host `explore` for plain codebase search; lfg `explorer` stays optional for OMO persona/model routing.
- Only shadow aliases (`grok-build`, `builder`, …) remain disabled in favor of lfg `coding` / `reviewer`.

### Setup UX (less noise)
- Install no longer asks about OpenAI-compatible CLI proxy / cliproxy / ocx-style routing.
- Default setup path is **vanilla Grok host auth** + bundled agent defaults.
- Multi-provider discovery is opt-in only via `lfg setup --base-url <url>` (or non-interactive flags).

### Grok-only coding tool
- Removed **pi-agent** as a coding-tool adapter. lfg is GrokBuild-only (`coding_tool_adapter = grok`).
- Legacy `pi-agent` values in `~/.grok/lfg.json` coerce to `grok` at read time.
- Bare `lfg` always launches `grok` (never pi-agent).

### Orchestration plane (GrokBuild-native)
- Architecture doc: `docs/grok-orchestration-plane.md` (app-server QA ≠ runtime dep; `multi_agent_v1` ≠ `codex_app`; lfg uses `spawn_subagent`).
- Grok-native team design + MVP ledger: `docs/grok-native-team-orchestration.md`, `src/core/lfg/team-ledger.ts` (durable `.omo/teams`; **teammode remains Deferred**).
- Continuation: boulder-state `getStopHookContinuationContext` + Sisyphus Stop/SubagentStop guidance; durable `lfg ulw-loop` pointer; **no automatic reinjection claim**.
- Executor evidence: `verifySubagentStopEvidence` for coding|hephaestus|builder (`.omo/evidence` WARNING/VERIFIED; fail-closed JSON).
- Skills: dual-host GrokBuild-first `spawn_subagent` mapping for orchestration skills.
- Pi honesty: `docs/omo-grokbuild-pi-agent-parity-adr.md` separates `pi-agent run` (`~/.grok`) from omo-senpi/senpi (`~/.senpi`).
- MCP companion / Z.AI: packaging notes + smoke checklist in `AGENTS.md` (companion stays decoupled).

### Explicit non-goals this train
- **No** `codex app-server` / `senpi app-server` as lfg setup or runtime dependency.
- **No** false Grok-adapted flips for teammode / workflow-selector / plan-mode intercept without host proof.
- App-server R&D spike recommendation: **no product** (evidence: `.omo/evidence/task-11-app-server-spike.md`).

## [0.1.26] — prior published baseline

See git tags / npm history for 0.1.26 and earlier. This file starts as a next-train draft from the orchestration epic gate.
