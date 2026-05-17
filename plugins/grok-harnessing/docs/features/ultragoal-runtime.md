# Feature: `/ultragoal` durable multi-goal plans (OMX parity)

## Goal

Deliver the full Grok Build equivalent of OMX `ultragoal`: create and execute durable repo-native multi-goal plans that sit on top of the primitive `goal` (and `grok_build_goal`) artifacts. Includes brief, stories, immutable ledger, quality-gate enforcement, and MCP surface so that `/ultragoal` in Grok is as powerful as the Codex version.

## User contract (Grok + CLI)

```text
# via Grok
/ultragoal create "Ship full parity" --brief "..." --checklist "inspect;impl;gate"

# via runtime (lfg / grok-build.py)
lfg ultragoal create "..." --id ug-1 --brief "..." --checklist "a;b;c"
lfg ultragoal status --id ug-1
lfg ultragoal checkpoint --id ug-1 --status complete --evidence "ai-slop + code-review APPROVE" --force-gate
lfg ultragoal show --id ug-1
```

## Runtime contract

- Commands: `lfg ultragoal {create,status,checkpoint,show}`
- MCP tool: `grok_build_ultragoal`
- State:
  - `~/.grok/plugin-data/grok-build/ultragoal/<id>/` (brief.md, goals.json, ledger.jsonl)
  - Backing primitive goals under `state/goals/`
  - Current pointer: `state/current-ultragoal.json`
- goals.json holds aggregate + per-story status + link to backing goal.
- ledger.jsonl is the append-only audit trail (ts, status, evidence, optional codex snapshot).
- Final-story `complete` checkpoint enforces quality gate (ai-slop-cleaner + code-review APPROVE evidence) unless `--force-gate`.

## Smoke coverage matrix

| Requirement | Test |
| --- | --- |
| ultragoal create/status/checkpoint/show persist brief+goals+ledger | `test_ultragoal_create_checkpoint_show_and_slash` |
| MCP ultragoal tool round-trips through lfg | `test_mcp_ultragoal_tool` |
| gate enforcement blocks premature final complete | covered by CLI behavior + existing goal tests |

Current smoke coverage target: **100% of the matrix above must pass** (added rows keep overall runtime coverage at 100%).
