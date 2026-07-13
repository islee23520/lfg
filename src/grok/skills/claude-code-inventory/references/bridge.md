# Grok ↔ Claude bridge protocol

Mailbox root: `~/.claude/lfg-bridge/` (override with `CLAUDE_HOME`).

## Files

| Path | Meaning |
|------|---------|
| `messages/<uuid>.json` | One message |
| `README.md` | Human summary |

## Message shape

```json
{
  "id": "uuid",
  "direction": "lfg_to_claude | claude_to_lfg",
  "status": "pending | read | replied",
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601",
  "body": "text",
  "cwd": "/path or null",
  "replyTo": "parent-id or null",
  "source": "lfg | claude-cli | …"
}
```

## Directions

- `lfg_to_claude` — Grok/lfg wrote; Claude should process
- `claude_to_lfg` — Claude (or `lfg claude ask`) wrote; Grok should process

## CLI

```bash
lfg claude message send "Please review the open PR"
lfg claude message list --box to-claude --pending
lfg claude message send --to lfg "Done: LGTM with one nit"
lfg claude ask "Summarize memory for this project"   # spawns claude -p when CLI exists
lfg claude ask "note only" --bridge-only             # mailbox only
```

## Claude Code agent behavior

When asked to check the lfg bridge:

1. `lfg --json claude message list --box to-claude --pending`
2. Read each message body; act on it
3. Reply with `lfg claude message send --to lfg "…"`
4. `lfg claude message mark <id> replied`
