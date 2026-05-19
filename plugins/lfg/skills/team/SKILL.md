---
name: team
description: "Create and manage an explicit LFG team lifecycle across optional coding providers, with Grok Oracle review discipline."
user_invocable: true
metadata:
  package: "linalab-io/lfg"
  source: "oh-my-codex/plugins/oh-my-codex/skills/team/SKILL.md"
  source_repo: "https://github.com/Yeachan-Heo/oh-my-codex"
  port_kind: "grok-team-lifecycle"
---

# Team — LFG team lifecycle

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

- Treat `/team` as a Grok slash-command frontdoor into explicit LFG team lifecycle commands.
- The team lifecycle can create durable tmux sessions/windows when a real team is launched.
- Supported providers: `hermes`, `claude`, `codex`, `gemini`, `copilot`, `zai`, `opencode`, `grok` (and alias `subagent`), `noop`.
  - The entire design goal of LFG team mode is to **maximise usage of every coding CLI the user has installed on this machine** (claude, codex, gemini, copilot, Z.ai/Zhipu via HTTP, opencode, hermes, etc.) while still giving you the option of native Grok sub-agents (`grok` / `subagent` provider).
  - `zai` uses the LFG Z.ai/Zhipu HTTP adapter; it stays dry-run without `--run` and requires `ZAI_API_KEY` or `ZHIPU_API_KEY` for real calls.
  - `opencode -p` is especially recommended for `architect` / `consultant` / deep reasoning lanes (gives Codex -p style planning depth).
- When you run `lfg team create` or `lfg ultragoal spawn`, it automatically detects installed tools via `which` and builds the best possible team from what is actually available.
- `grok` / `subagent` = native Grok sub-agents (via `spawn_subagent`). These are **first-class ULW workers**. The prompt they receive explicitly tells them "You are an ULW worker" and instructs them to report using `ulw ultragoal checkpoint` or the MCP equivalent. This is the intended way to get real Grok sub-agents inside an LFG team.
- Special roles (`architect`, `consultant`, `deep`, etc.) get the strong "gpt5.5 + codex -p style" high-reasoning persona with multi-AI consultation instructions.
- When a current ultragoal is active (or `/ultragoal spawn` is used), the team is automatically linked to the ultragoal ledger. Workers are instructed to report via `ulw ultragoal checkpoint --id <ugid>`. This makes classic OMX team mode behave like Grok-native sub-agent swarm spawning tied to a durable goal.
- Every team result is expected to pass leader verification and Grok Oracle review before it can be treated as complete.
- Do not use this as the default for simple tasks; use it when tmux/worktree/durable coordination is explicitly desired.

## Grok slash-command handling

When the user invokes `/team`, map the slash string to the LFG runtime. Prefer the MCP tool `grok_build_slash` when available; otherwise run `bin/lfg slash` from the plugin root.

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
plugins/lfg/bin/lfg backend start
plugins/lfg/bin/lfg team create 3:executor "fix the failing tests with verification"
plugins/lfg/bin/lfg team status <team-name>
plugins/lfg/bin/lfg team resume <team-name>
plugins/lfg/bin/lfg team shutdown <team-name>
```

Dry-run without launching agents:

```sh
plugins/lfg/bin/lfg team create 3:executor "fix the failing tests with verification" --dry-run
```

## Response contract

When handling `/team`, report:

1. team name
2. tmux attach command
3. providers launched
4. state file path
5. verification/status command
