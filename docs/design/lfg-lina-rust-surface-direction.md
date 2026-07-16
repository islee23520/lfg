# Deep-interview final direction — lfg × lina Rust surface

**Session:** `lfg-lina-20260716`
**Skill:** deep-interview → final
**Threshold:** 0.5 (standard)
**Status:** direction locked (proxy answers + brownfield evidence)
**Ambiguity (reported):** ≤ 0.35 after fork resolution

## Goal restatement (one sentence)

Ship a **Grok-independent Rust control plane** by carrying **`~/workspace/linalab/lina`** (ratatui TUI + Codex engine/app-server client) into the **lfg monorepo under `rust/`**, with **AgenC-core process-model quality** (daemon-or-TUI client + live monitor + handoff), while **Node `@islee23520/lfg` remains the Grok plugin install/publish surface**.

## Topology (Round 0 — locked components)

| Component | Owner | Responsibility |
|---|---|---|
| C1 Node lfg CLI | `src/cli`, `dist/lfg.js` | `handoff plan`, `plan goal`, orchestrator, accounts, skill-route, Grok setup |
| C2 Grok plugin hooks | `src/grok/assets/hooks` | Optional host glue; **not** sole control plane |
| C3 Rust surface workspace | `rust/` (from lina crates) | Always-on ratatui TUI; Codex stream/app-server attach; monitor board UI |
| C4 Shared ledger | `.omo/orchestrator/*` | Inbox, results, monitor-board, auto-goal receipts — **shared truth** |
| C5 Codex App | host `codex app-server` | Sole product implementer transport |
| C6 Reference quality bar | agenc-core | Daemon/clients/heartbeat patterns — **not** a full port |

## Resolved forks

| ID | Decision |
|---|---|
| **A Binary** | Primary binary **`lfg-tui`** (or `lfg surface`); keep crate rename path `lina-*` → `lfg-*` gradually. Do not force rename day-one if it blocks carry-over. |
| **B Layout** | **Monorepo carry-over**: copy lina workspace into `lfg/rust/` (not submodule). Preserve git history via `git subtree` later if desired; first landing is full tree copy minus `target/`. |
| **C MVP scope** | **Phase 1:** TUI monitor board + `handoff`/`plan goal` bridge + app-server attach + skill-route display. **Phase 2:** full agent tool loop (lina-core tools) inside Rust. |
| **D Inbox truth** | **`.omo/orchestrator`** stays source of truth shared with Node. No parallel `~/.lfg` inbox for v1. |
| **E AgenC depth** | **v1:** TUI-direct bridge + heartbeat-style poll loop in TUI (no full budget, no multi-channel gateway). Optional thin local socket daemon only if TUI-only becomes insufficient. |
| **F Grok boundary** | Grok hooks remain **install/optional host**. Orchestration UX and continuous monitor **move to Rust surface**. Skill routing remains computed in Node handoff core; Rust displays/triggers same CLI. |

## Process model (AgenC-inspired, honest)

```
┌─────────────┐     spawn/attach      ┌──────────────────────┐
│ lfg-tui     │ ────────────────────► │ Codex app-server     │
│ (ratatui)   │ ◄── stream events ──  │ (implementer)        │
└──────┬──────┘                       └──────────────────────┘
       │ read/write
       ▼
┌──────────────────────┐     exec JSON      ┌─────────────────┐
│ .omo/orchestrator    │ ◄───────────────── │ node dist/lfg.js│
│ inbox + monitor-board│                    │ plan/handoff    │
└──────────────────────┘                    └─────────────────┘
```

- **Surface ownership:** TUI always owns the screen (lina rule: engine never owns surface).
- **Implementer ownership:** Codex App / handoff only for product body.
- **Heartbeat analog:** TUI tick polls `lfg --json orchestrator poll|watch` and renders live board (not “MUST run” text alone).

## Phased MVP

### Phase 0 — Carry-over (this week)
1. `rsync` lina → `lfg/rust/` (exclude `target/`, `.git`)
2. Workspace builds: `cargo test --workspace` in `rust/`
3. Doc: this ADR + README for `rust/`

### Phase 1 — Control plane MVP (acceptance)
- [ ] `cargo run -p lina` (or `lfg-tui`) launches TUI from `lfg/rust`
- [ ] TUI shows live board from `.omo/orchestrator/inbox.json` (+ optional `lfg --json orchestrator watch`)
- [ ] Slash or key: handoff / plan goal → shells to Node `lfg --json …` with skill-routed focus
- [ ] Codex app-server client from lina WIP works against project cwd
- [ ] No requirement for Grok session to monitor Codex threads

### Phase 2 — Deepen
- Full lina agent tool loop optional inside Rust
- Thin daemon socket if multi-client needed
- Gradual `lina-*` → `lfg-*` rename

## Non-goals (v1)
- Port entire AgenC gateway/Telegram/budget
- Replace Node package publish for Grok plugin
- Silent midflight Codex nudges (low-nudge still holds for chat CEO; TUI can poll passively)

## Risks
| Risk | Mitigation |
|---|---|
| Dual codepaths drift | Shared `.omo` ledger + Node CLI as single mutator for handoff |
| Grok hook drift vs Rust | Document hooks as optional; surface is Rust |
| Large rsync noise | Exclude target; one commit “import rust surface” |

## Evidence (brownfield)
- lina: ratatui TUI, Codex streaming session, WIP `app_server` Unix WS client (`crates/lina-providers/src/app_server.rs`)
- lfg: `planOmoHandoff` + `skill-route`, orchestrator inbox/watch, Grok hooks
- agenc-core: launcher → daemon → clients; heartbeat ticks

## Explicit execution gate
Deep-interview **does not implement**. After user approval of this ADR, execution starts with Phase 0 rsync + Phase 1 TUI monitor board.

## Korean summary
- **방향:** Grok 훅에만 기대지 말고, lina Rust/ratatui를 lfg `rust/`로 가져와 **독립 컨트롤 플레인**으로 쓴다.
- **MVP:** 모니터 보드 + handoff/goal + app-server 연결 (에이전트 풀툴은 2단계).
- **진실 원천:** `.omo/orchestrator` 공유.
- **다음:** 이 ADR 승인 후 Phase 0 카피 → Phase 1 TUI.
