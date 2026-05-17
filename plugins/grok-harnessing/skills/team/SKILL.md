---
name: team
description: "Create and manage an LFG tmux backend team for Grok Build, using hermes -z, Claude Code, and Codex workers."
user_invocable: true
metadata:
  package: "linalab-io-framework/grok-build"
  source: "oh-my-codex/plugins/oh-my-codex/skills/team/SKILL.md"
  source_repo: "https://github.com/Yeachan-Heo/oh-my-codex"
  port_kind: "grok-tmux-backend"
---

# Team — LFG tmux backend

Use this skill when the user wants durable team execution, especially commands like:

```text
/team 3:executor "fix the failing tests with verification"
/team status <team-name>
/team resume <team-name>
/team shutdown <team-name>

# Ultragoal-driven ulw swarm (preferred when you have an active durable goal)
/ultragoal spawn 3:executor "complete the next story in parallel"
```

## Behavior

- Treat `/team` as a Grok slash-command frontdoor into the LFG tmux backend.
- The backend creates durable tmux sessions/windows.
- Default worker providers rotate through `hermes`, `claude`, and `codex`.
- Hermes workers are launched with `hermes -z <prompt> chat`.
- Claude workers are launched with `claude --permission-mode bypassPermissions <prompt>`.
- Codex workers are launched with `codex <prompt>`.
- Store team state under `~/.grok/plugin-data/grok-build/state/teams/`.
- When a current ultragoal is active (or `/ultragoal spawn` is used), the team is automatically linked to the ultragoal ledger. Workers are instructed to report via `ulw ultragoal checkpoint --id <ugid>`. This makes classic OMX team mode behave like Grok-native sub-agent swarm spawning tied to a durable goal.
- Do not use this as the default for simple tasks; use it when tmux/worktree/durable coordination is explicitly desired.

## Grok slash-command handling

When the user invokes `/team`, map the slash string to the LFG backend. Prefer the MCP tool `grok_build_slash` when available; otherwise run `bin/lfg slash` from the plugin root.

Examples:

```text
/team 3:executor "fix the failing tests with verification"
/team status <team-name>
/team resume <team-name>
/team shutdown <team-name>

# Ultragoal-driven ulw swarm (preferred when you have an active durable goal)
/ultragoal spawn 3:executor "complete the next story in parallel"
```

MCP equivalent:

```json
{"tool":"grok_build_slash","arguments":{"command":"/team 3:executor \"fix the failing tests with verification\"","dryRun":false}}
```

Use `dryRun:true` for planning or safety checks. Use `dryRun:false` only when the user clearly wants workers launched.

## Runtime commands

From the plugin root or repo root:

```sh
plugins/grok-harnessing/bin/lfg backend start
plugins/grok-harnessing/bin/lfg team create 3:executor "fix the failing tests with verification"
plugins/grok-harnessing/bin/lfg team status <team-name>
plugins/grok-harnessing/bin/lfg team resume <team-name>
plugins/grok-harnessing/bin/lfg team shutdown <team-name>
```

Dry-run without launching agents:

```sh
plugins/grok-harnessing/bin/lfg team create 3:executor "fix the failing tests with verification" --dry-run
```

## Response contract

When handling `/team`, report:

1. team name
2. tmux attach command
3. providers launched
4. state file path
5. verification/status command
