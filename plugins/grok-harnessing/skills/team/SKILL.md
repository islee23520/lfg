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
```

## Behavior

- Treat `/team` as a Grok slash-command frontdoor into the LFG tmux backend.
- The backend creates durable tmux sessions/windows.
- Default worker providers rotate through `hermes`, `claude`, and `codex`.
- Hermes workers are launched with `hermes -z <prompt> chat`.
- Claude workers are launched with `claude --permission-mode bypassPermissions <prompt>`.
- Codex workers are launched with `codex <prompt>`.
- Store team state under `~/.grok/plugin-data/grok-build/state/teams/`.
- Do not use this as the default for simple tasks; use it when tmux/worktree/durable coordination is explicitly desired.

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
