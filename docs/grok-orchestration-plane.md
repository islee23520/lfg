# Grok Orchestration Plane (Full-Picture ADR)

**Status:** Draft (2026-07-09; teammode spawn_subagent note 2026-07-11)  
**Complements:** [Ultraresearch SYNTHESIS](.omo/ultraresearch/20260709-123633/SYNTHESIS.md), [`docs/grok-adapter-core-port-strategy.md`](grok-adapter-core-port-strategy.md)

This ADR synthesizes the distinct **OMO / senpi control planes** that appear in upstream documentation, QA harnesses, and reverse-engineering artifacts. It clarifies how they relate (or do not relate) to lfg's GrokBuild surface.

**Core invariants (preserved by lfg):**
- app-server is NOT an lfg runtime dependency
- teammode deferred until Grok-native team (codex_app not available) for **codex_app-class** threads; Grok teammode uses **spawn_subagent** (host built-ins + lfg OMO agents) instead
- multi_agent_v1 ≠ codex_app (different planes)
- lfg uses spawn_subagent
- senpi / omo-senpi is a separate control plane; lfg does not claim parity

lfg must not claim that Grok has an app-server surface. Orchestration in lfg routes through GrokBuild native primitives (`spawn_subagent`, hooks, skills, Boulder state) and the shipped `delegate-core` / `boulder-state` slices. Full team/task RPC parity (senpi / codex_app) remains a gap; **skill + script teammode on spawn_subagent is Grok-adapted**.

## (A) codex app-server QA plane

OMO's `codex-qa` skill and some hook verifiers spawn a real `codex app-server` binary as an NDJSON control plane. This is **QA harness infrastructure only** — not a runtime dependency of normal OMO agent loops or lfg. The app-server exposes `hook/started`, `hook/completed` events for integration testing. See SYNTHESIS.md for exact upstream locations. lfg's test surface (`vitest`, `runGrokInstall` acceptance tests, self-test) substitutes its own temp-home verification instead of depending on a Codex binary.

## (B) codex_app team threads

`codex_app.*` tools (e.g. `create_thread`) create durable desktop/app-level threads used exclusively by upstream Codex `teammode`. OMO teammode's PostToolUse reacts to these and forbids `multi_agent_v1` for team members (see upstream `teammode` skill). Because GrokBuild has no equivalent `codex_app` surface, **teammode remains deferred** for codex_app-class durable threads. **Grok-adapted substitute:** `spawn_subagent` transport with dual agent catalogs (host built-ins + lfg OMO agents) and durable `.omo/teams`. `codex_app` and the subagent plane are distinct orchestration layers.

## (C) multi_agent_v1 subagent plane

`multi_agent_v1.spawn_agent` (and related mailbox/wait/close primitives) is Codex's in-process subagent orchestration. Upstream skills such as `ultrawork` map OpenCode `task` / `delegate-task` calls here. This is **not** the same as `codex_app` team threads. lfg maps equivalent intent to GrokBuild's `spawn_subagent` (with `subagent_type` roles: host built-ins `general-purpose`/`explore`/`plan` plus lfg OMO `explorer`/`hephaestus`/`coding`/…). The `delegate-core` and `boulder-state` cores already ship in lfg.

## (D) senpi app-server reverse-engineering

`senpi app-server` is a reverse-engineered, Codex-protocol-compatible JSON-RPC subset implemented directly over Pi `AgentSession` (stdio/ws/unix). It is **not** a proxy to the Codex binary. The protocol was pinned from a specific `codex-cli` version. This plane powers senpi-first task/team flows but is not used by lfg.

## (E) omo-senpi task/team RPC

The Pi extraction axis (`@earendil-works/pi-agent-core`, `@code-yeongyu/senpi`, `omo-senpi`, `senpi-task`, `team-core`) uses RPC child processes for task and team coordination. This is distinct from both Codex `multi_agent_v1` and `codex_app`. `omo-senpi` extensions + skills route through these RPCs rather than in-process subagents. Upstream ROADMAP notes core layers are migrating to shared `*-core` packages.

## (F) lfg spawn_subagent + current gaps

lfg's orchestration today is:
- GrokBuild `spawn_subagent` for host built-ins and lfg OMO agents (see `teammode` skill dual catalogs + `start-work` mapping).
- `teammode` script transport `spawn_subagent` + `team-ledger` under `.omo/teams`.
- `boulder-state` and partial `delegate-core` for durable work tracking.
- Skills like `ulw-plan`, `ulw-loop`, `ultrawork` installed via sync.

**Gaps (explicitly not claimed):**
- No app-server control plane.
- No `codex_app` durable threads / MultiAgentV2 mailbox (teammode peer traffic is leader + artifacts on Grok).
- Full senpi-task / omo-senpi behavioral parity (separate control plane, not claimed).

## Next-release target

The epic focuses on hardening `spawn_subagent` mapping, expanding Boulder/ledger evidence for team flows, and optional Grok-native control-plane research (without claiming app-server). No upstream control-plane binary or Codex `codex_app` surface is introduced into lfg's runtime. All changes stay within existing GrokBuild primitives and the shipped host-neutral cores.

This document keeps docs in sync with the SYNTHESIS research and existing ADRs. See `assert-omo-parity` gate for related payload integrity.

## MVP substitute classification (#74 pass conditions)

This section satisfies the gateway acceptance criteria: gaps classified, substitutes documented, spawn_subagent teammode is inventory **Grok-adapted** with dual agent catalogs.

| Deferred component | Host dependency class | MVP substitute shipped | Full parity status |
|---|---|---|---|
| teammode | codex_app (host dependency class: codex_app) for thread plane; Grok uses spawn_subagent | `skills/teammode` spawn_subagent transport + `team-agents.mjs` (host built-ins + lfg OMO); `team-ledger.ts`; tests | **Grok-adapted** (spawn_subagent); codex_app/MultiAgentV2 residual |
| start-work-continuation | Stop/SubagentStop hook | Sisyphus native Stop/SubagentStop hooks (`lfg-sisyphus-hooks.mjs`); durable `lfg ulw-loop` CLI for checkpoint/resume across sessions | **Deferred** (MVP substitutes shipped; automatic reinjection not claimed) |
| lazycodex-executor-verify | Stop/SubagentStop hook | pure `verifySubagentStopEvidence` + T3 e2e wiring into `lfg-sisyphus-hooks.mjs` SubagentStop (coding\|hephaestus\|builder, `.omo/evidence`, fail-closed JSON) | **Deferred** (T3 sisyphus additionalContext proven; dedicated host-enforced CLI not claimed) |

### Substitute evidence

- **teammode**: GrokBuild `spawn_subagent` + dual catalogs (host `general-purpose`/`explore`/`plan` + lfg OMO agents); durable `.omo/teams`; `team-ledger` + `teammode-spawn-subagent.test.ts`. No `codex_app` host surface is introduced.
- **start-work-continuation**: Sisyphus `Stop`/`SubagentStop` hooks inject continuation guidance referencing `lfg ulw-loop` for durable checkpoint/resume and explicitly deny automatic reinjection; boulder-state `getStopHookContinuationContext` present path matches that honesty contract (ledgerPath + durable CLI pointer). See `src/grok/assets/hooks/lfg-sisyphus-hooks.mjs` and T5 evidence.
- **lazycodex-executor-verify**: `verifySubagentEvidence()` (regex) plus T3 pure `verifySubagentStopEvidence` from `subagent-stop-evidence-verifier.ts` (`.omo/evidence` for coding|hephaestus|builder, fail-closed malformed JSON) both run in `lfg-sisyphus-hooks.mjs` SubagentStop. Unit + e2e tests green; remains Deferred without dedicated host-enforced CLI.
