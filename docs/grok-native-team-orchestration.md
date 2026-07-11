# Grok-Native Team Orchestration (Decision-Complete Design)

**Status:** Decision-Complete (2026-07-09) for checkbox 4; MVP ledger implemented for checkbox 5. `teammode` inventory status **Grok-adapted** (spawn_subagent dual catalog) — flipped from Deferred with spawn_subagent transport + dual agent catalogs (host built-ins + lfg OMO agents); residual is mailbox/codex_app only (no codex_app/MultiAgentV2 mailbox on Grok; peer coordination via leader + artifacts).
**Complements:** [`docs/grok-orchestration-plane.md`](grok-orchestration-plane.md), [`docs/grok-adapter-parity.md`](grok-adapter-parity.md), upstream [`packages/team-core`](https://github.com/code-yeongyu/oh-my-openagent/tree/main/packages/team-core) and `omo-senpi` team-service patterns, [`skills/teammode/SKILL.md`](../skills/teammode/SKILL.md), `src/core/lfg/team-ledger.ts`
**todo 5** (MVP ledger) is implemented; checkbox 4 (design) is decision-complete.

This document records the **Grok-native mapping** for team orchestration. Checkbox 4 (design) + checkbox 5 (minimal usable Grok-native team surface MVP ledger: durable JSON under .omo/teams, TS module with create/add/record-spawn/append-message/list/status/shutdown, skill guidance update, tests with temp dirs proving sequence + fail-closed) are complete. `teammode` is now **Grok-adapted** via spawn_subagent transport. Evidence in `.omo/evidence/task-5-lfg-next-release-app-server-epic.txt`. Commit: `feat(team): Grok-native team orchestration MVP`.

**Core invariants (preserved):**
- OMO teammode members map to Grok `spawn_subagent` (or explicit missing API).
- Durable state lives under `.omo/teams` using `team-core` concepts.
- Lead-facing tools: `create`/`list`/`message`/`status`/`shutdown` (no `codex_app.*`).
- **Explicit: NO required `codex_app.*` tool names on Grok**.
- no codex_app.* tool names are required or referenced on the Grok surface.
- When host lacks thread API, use skill-only fallback.
- State and skill patterns stay host-neutral; no app-server binary.
- durable state under `.omo/teams` using team-core concepts (from oh-my-openagent packages/team-core and omo-senpi).

## 1. OMO teammode members → Grok `spawn_subagent` mapping

Upstream OMO `teammode` (and `team-core`):
- Members are persistent Codex threads created with the thread API (durable title, archive, messaging via codex_app primitives).
- Lead is main session; coordination via mailbox + tasklist on disk.
- `team-core` provides registry, mailbox, tasklist, state-store, worktree primitives (see `../oh-my-openagent/packages/team-core/AGENTS.md` for schemas).

Grok-native mapping:
- **Members** → `spawn_subagent({ subagent_type: "sisyphus" | "atlas" | "hephaestus", background: true, description: "<member focus>", prompt: "<bootstrap from .omo/teams/.../guide.md + teamRunId + memberId>", team_context: { teamRunId, memberId, role: "member" } })`.
- **Lead** is always the **main Grok session** (no spawn for lead; matches upstream "you are the leader - orchestrate").
- Subagent responses are routed back via Grok's native subagent callback / PostSubagentStop hook (or skill prompt pattern) into the `team-core` mailbox/tasklist.
- `spawn_subagent` provides the execution plane; `team-core` provides the durable identity, mailbox, and task coordination (no reliance on Grok "thread" persistence beyond what spawn_subagent offers).
- **spawn_subagent mapping phrase:** OMO teammode members map directly to Grok `spawn_subagent` with `subagent_type` roles drawn from existing lfg mappings (`explorer`/`plan`/`coding`/`hephaestus` adapted for team context). If Grok host exposes no stable subagent identity or callback for a given session, treat as missing API.

This mapping reuses shipped `delegate-core` / `boulder-state` slices for orchestration glue.

## 2. Durable state under `.omo/teams`

Adopt `team-core` storage layout exactly (registry + state-store):
- **Primary path:** `~/.omo/teams/{teamNameOrRunId}/` (user-global).
- **Project override:** `./.omo/teams/{teamNameOrRunId}/` (wins on conflict, per upstream loader).
- Contents (JSON, atomic writes via temp+rename locks from team-core):
  - `config.json`: TeamSpec (`name`, `description`, `lead`, `members[]` with `kind: "subagent_type"|"category"`, eligibility from `AGENT_ELIGIBILITY_REGISTRY`).
  - `state.json`: RuntimeState (status, liveness, task summary, log).
  - `tasks/`: Per-task JSON or jsonl for tasklist (claim, update, dependencies, status: pending/claimed/in_progress/completed/blocked).
  - `mailbox/`: Per-member inboxes (unread polling, ack, reservation per team-core/mailbox).
  - `artifacts/`: Shared file exchange.
  - `guide.md`: Auto-generated member manual (regenerated on every mutate, like upstream `team.mjs`).
- Integrates with existing lfg `boulder-state` ledger and `.omo/ulw-loop` for cross-session resume.
- `lfg-config-loader.mjs` (or future hook) can surface team context on SessionStart / SubagentStop.
- State is **inspectable by user** (`cat .omo/teams/.../state.json`) and survives Grok restarts.

This makes orchestration durable independent of any host thread API gaps.

## 3. Lead-facing tools (names + behaviors)

The design surfaces these **lead-facing operations** (main session / user prompt). Implemented via updated `teammode` skill prompt patterns or future lfg MCP skill (no Codex tool names). Behaviors drawn from `team-core` + upstream `team-mode.md`:

- **`team_create(name, description, members)`**: 
  - Validates spec against `team-core` eligibility (reject hard-reject agents like oracle).
  - Writes `.omo/teams/{id}/config.json + state.json + guide.md`.
  - Returns `teamRunId`. Idempotent. Optionally launches initial member subagents via `spawn_subagent`.
  - Behavior: "Creates durable team under `.omo/teams`; lead is current session."

- **`team_list([filter])`**: 
  - Scans registry (`team-core` loader) for teams in `~/.omo/teams` and cwd `.omo/teams`.
  - Shows status, active members, unread count, last activity.
  - Behavior: Non-mutating overview.

- **`team_message(teamRunId, to, content)`**:
  - Writes to mailbox (lead-to-member routes via `spawn_subagent` continuation with context; member-to-lead updates state for lead to poll/read).
  - Supports broadcast (`to: "*"`) and peer messages.
  - Behavior: Persistent, acked delivery per team-core/mailbox.

- **`team_status(teamRunId)`**:
  - Reads current `state.json`, tasklist summary, member statuses, unread messages.
  - Behavior: Real-time view without side effects.

- **`team_shutdown(teamRunId, force?)`**:
  - Sends shutdown signals to members (via message or spawn context), awaits acks or timeout.
  - Archives state, cleans worktrees, deletes if force.
  - Behavior: Graceful only; refuses active work unless forced. Updates boulder ledger.

These names avoid `codex_app` or upstream `team_*` literal collisions on Grok. Prompts will show concrete `spawn_subagent` examples for members. No MCP server required for MVP design.

## 4. Failure modes and skill-only fallback when host lacks thread API

**Primary failure modes:**
- `spawn_subagent` unavailable/rate-limited in session → cannot launch real members.
- No reliable callback from subagents to update mailbox/state (missing thread API equivalent).
- Lock contention on `.omo/teams` files (mitigated by team-core retry).
- Ineligible members or invalid spec (fail at `team_create` with diagnostic).
- Worktree/git conflicts during integrate (handled by team-worktree primitive).

**Skill-only fallback (when host lacks thread API):**
When the Grok host lacks native persistent thread API support equivalent to `codex_app`, fall back to skill-only orchestration: durable state is still written to `.omo/teams` but member coordination is prompt-driven rather than subagent-spawned. The `teammode` skill prints the full team spec + guide.md, instructs user to run parallel conversations manually (or via `ulw` parallel subagents), and logs all activity to state files for later resume/inspection. This keeps the durable `.omo/teams` contract alive even without full host primitives.

Failure always fail-closed: never report a "live" member without evidence in state. Skill detects capability (via existing model/runtime checks) and routes to fallback phrase above. This preserves honesty in `grok-adapter-parity.md` (teammode is Grok-adapted via spawn_subagent; residual is codex_app mailbox only).

## Decisions & Next Steps

- **Decided:** Use `.omo/teams` + `team-core` primitives + `spawn_subagent` for members. Lead = main session. Skill-only fallback mandatory. **No `codex_app.*` anywhere in Grok path.**
- **Out of scope:** Full codex_app/MultiAgentV2 mailbox runtime, new MCP tools, senpi app-server shim, tmux visualization.
- **Evidence:** `.omo/evidence/task-4-lfg-next-release-app-server-epic.md`
- Update `skills/teammode/` prompts with this mapping only after design approval. Run `npm run assert-omo-parity` after any inventory touch (but none here).
- Complements existing `delegate-core` / `boulder-state` / `ulw-loop` shipped slices.

This design keeps lfg's Grok-first framing, matches upstream `team-core` storage, and provides a clear migration path from Codex-only `teammode` skill without breaking existing fallback behavior. See `assert-omo-parity` gate for payload discipline.
