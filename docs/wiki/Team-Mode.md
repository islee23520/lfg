# Team Mode

**Team Mode is the active multi-agent coordination layer** when `team_mode.enabled=true`.

It provides durable mailbox, tasklist, and state separation so that Sisyphus and other OMO agents can collaborate reliably.

## Core Components

- `TeamRuntime` — manages the overall team lifecycle
- `TeamStateStore` — durable state per run
- `TeamMailbox` — message passing between agents
- `TeamTasklist` — dependency-wave checklist execution (Atlas style)

All team state is stored under:

```
.lfg/runs/<mode>-<id>/
```

This mirrors the real OMO `~/.omo/state/team/<run-id>/` pattern and keeps different modes (ultrawork, hyperplan, team, etc.) isolated.

## Primary Interface (Current)

When Team Mode is enabled, use these commands:

```sh
lfg team create 3:executor "fix the failing tests with verification"
lfg team task create <team-id> "verify release gates"
lfg team send-message <team-id> <agent> "status update"
lfg team status <team-id>
lfg team resume <team-id>
lfg team shutdown <team-id>
```

Equivalent slash commands inside Grok:
- `/team create ...`
- `/team preflight`
- `/team providers`

## How Sisyphus Uses Team Mode

1. Sisyphus receives a complex goal
2. It may call Prometheus to create a plan
3. It spawns Sisyphus-Junior / Hephaestus / Atlas via the Grok Spawn Adapter
4. All spawned agents communicate through `TeamMailbox` and update `TeamTasklist`
5. Sisyphus synthesizes results, advances the Boulder, and verifies evidence

## Verification

Team Mode behavior is covered by:

- `plugins/lfg/bin/self-test.sh team tmux lifecycle section`
- `plugins/lfg/bin/self-test.sh team preflight section`
- `plugins/lfg/bin/self-test.sh team provider section`
- `plugins/lfg/bin/self-test.sh` (contains `team-dry-run=ok`, `team-tmux-lifecycle=ok`)

All gates must emit exact `*=ok` evidence strings.

## Current Status

- Team Mode: **Enabled** in this session
- `team_*` tools are the authoritative orchestration interface
- Legacy flat team-state compatibility is still preserved for migration

---

**See also**: [Agent Hierarchy](./Agent-Hierarchy.md), [How It Works](./How-It-Works.md)
