# Grok Orchestration Plane (Full-Picture ADR)

**Status:** Draft (2026-07-09)  
**Complements:** [Ultraresearch SYNTHESIS](.omo/ultraresearch/20260709-123633/SYNTHESIS.md), [`docs/grok-adapter-core-port-strategy.md`](grok-adapter-core-port-strategy.md), [`docs/omo-grokbuild-pi-agent-parity-adr.md`](omo-grokbuild-pi-agent-parity-adr.md)

This ADR synthesizes the distinct **OMO / senpi control planes** that appear in upstream documentation, QA harnesses, and reverse-engineering artifacts. It clarifies how they relate (or do not relate) to lfg's GrokBuild surface.

**Core invariants (preserved by lfg):**
- app-server is NOT an lfg runtime dependency
- teammode deferred until Grok-native team (codex_app not available)
- multi_agent_v1 ≠ codex_app (different planes)
- lfg uses spawn_subagent
- pi-agent run ≠ omo-senpi without proof

lfg must not claim that Grok has an app-server surface or that teammode qualifies as Grok-adapted. Orchestration in lfg routes through GrokBuild native primitives (`spawn_subagent`, hooks, skills, Boulder state) and the shipped `delegate-core` / `boulder-state` slices. Full team/task RPC parity remains a gap.

## (A) codex app-server QA plane

OMO's `codex-qa` skill and some hook verifiers spawn a real `codex app-server` binary as an NDJSON control plane. This is **QA harness infrastructure only** — not a runtime dependency of normal OMO agent loops or lfg. The app-server exposes `hook/started`, `hook/completed` events for integration testing. See SYNTHESIS.md for exact upstream locations. lfg's test surface (`vitest`, `runGrokInstall` acceptance tests, self-test) substitutes its own temp-home verification instead of depending on a Codex binary.

## (B) codex_app team threads

`codex_app.*` tools (e.g. `create_thread`) create durable desktop/app-level threads used exclusively by `teammode`. OMO teammode's PostToolUse reacts to these and forbids `multi_agent_v1` for team members (see upstream `teammode` skill). Because GrokBuild has no equivalent `codex_app` surface, **teammode remains deferred** until a Grok-native team implementation exists. `codex_app` and the subagent plane are distinct orchestration layers.

## (C) multi_agent_v1 subagent plane

`multi_agent_v1.spawn_agent` (and related mailbox/wait/close primitives) is Codex's in-process subagent orchestration. Upstream skills such as `ultrawork` map OpenCode `task` / `delegate-task` calls here. This is **not** the same as `codex_app` team threads. lfg maps equivalent intent to GrokBuild's `spawn_subagent` (with `subagent_type` roles: explorer/plan/coding/hephaestus). The `delegate-core` and `boulder-state` cores already ship in lfg; full durable team orchestration is still a gap.

## (D) senpi app-server reverse-engineering

`senpi app-server` is a reverse-engineered, Codex-protocol-compatible JSON-RPC subset implemented directly over Pi `AgentSession` (stdio/ws/unix). It is **not** a proxy to the Codex binary. The protocol was pinned from a specific `codex-cli` version. This plane powers senpi-first task/team flows but is not required by lfg's current `pi-agent run` route.

## (E) omo-senpi task/team RPC

The Pi extraction axis (`@earendil-works/pi-agent-core`, `@code-yeongyu/senpi`, `omo-senpi`, `senpi-task`, `team-core`) uses RPC child processes for task and team coordination. This is distinct from both Codex `multi_agent_v1` and `codex_app`. `omo-senpi` extensions + skills route through these RPCs rather than in-process subagents. Upstream ROADMAP notes core layers are migrating to shared `*-core` packages.

## (F) lfg spawn_subagent + current gaps

lfg's orchestration today is:
- GrokBuild `spawn_subagent` for explorer/plan/coding/hephaestus roles (see `start-work` skill mapping).
- `boulder-state` and partial `delegate-core` for durable work tracking.
- Skills like `ulw-plan`, `ulw-loop`, `ultrawork` installed via sync.

**Gaps (explicitly not claimed):**
- No app-server control plane.
- teammode deferred (no Grok-native equivalent of `codex_app` or full `team-core` RPC).
- Full senpi-task / omo-senpi behavioral parity (pi-agent run route provides launch/auth only).
- Durable team threads and advanced task mailbox UX beyond current `spawn_subagent`.

## Next-release target

The epic focuses on hardening `spawn_subagent` mapping, expanding Boulder/ledger evidence for team flows, optional Grok-native control-plane research (without claiming app-server), and clarifying Pi vs senpi paths per the parity ADR. No upstream control-plane binary or Codex `codex_app` surface is introduced into lfg's runtime. All changes stay within existing GrokBuild primitives and the shipped host-neutral cores.

This document keeps docs in sync with the SYNTHESIS research and existing ADRs. See `assert-omo-parity` gate for related payload integrity.

## MVP substitute classification (#74 pass conditions)

This section satisfies the gateway acceptance criteria: gaps classified, substitutes documented, no Deferred status flipped without e2e proof.

| Deferred component | Host dependency class | MVP substitute shipped | Full parity status |
|---|---|---|---|
| teammode | codex_app (host dependency class: codex_app) | `docs/grok-native-team-orchestration.md` decision-complete design + MVP ledger; team skill payload installed via sync | **Deferred** (no status flip — `codex_app` host surface not available) |
| start-work-continuation | Stop/SubagentStop hook | Sisyphus native Stop/SubagentStop hooks (`lfg-sisyphus-hooks.mjs`); durable `lfg ulw-loop` CLI for checkpoint/resume across sessions | **Deferred** (MVP substitutes shipped; automatic reinjection not claimed) |
| lazycodex-executor-verify | Stop/SubagentStop hook | pure `verifySubagentStopEvidence` + T3 e2e wiring into `lfg-sisyphus-hooks.mjs` SubagentStop (coding\|hephaestus\|builder, `.omo/evidence`, fail-closed JSON) | **Deferred** (T3 sisyphus additionalContext proven; dedicated host-enforced CLI not claimed) |

### Substitute evidence

- **teammode**: `docs/grok-native-team-orchestration.md` MVP ledger documents decision-complete design; `teammode` skill payload installed via `sync-omo-skills-to-grok.mjs`. No `codex_app` host surface is introduced.
- **start-work-continuation**: Sisyphus `Stop`/`SubagentStop` hooks inject continuation guidance referencing `lfg ulw-loop` for durable checkpoint/resume and explicitly deny automatic reinjection; boulder-state `getStopHookContinuationContext` present path matches that honesty contract (ledgerPath + durable CLI pointer). See `src/grok/assets/hooks/lfg-sisyphus-hooks.mjs` and T5 evidence.
- **lazycodex-executor-verify**: `verifySubagentEvidence()` (regex) plus T3 pure `verifySubagentStopEvidence` from `subagent-stop-evidence-verifier.ts` (`.omo/evidence` for coding|hephaestus|builder, fail-closed malformed JSON) both run in `lfg-sisyphus-hooks.mjs` SubagentStop. Unit + e2e tests green; remains Deferred without dedicated host-enforced CLI.

### Z.AI vision MCP (#89)

Z.AI vision MCP is **shipped** (not Deferred): `lfg zai mcp install vision` configures `[mcp_servers.zai-vision]` in `~/.grok/config.toml` via the built-in `lfg zai` subcommand. Full companion plugin (`@islee23520/lfg-mcp`) provides xAI Grok MCP runtime as a decoupled companion. No host-bound dependency blocks this surface.