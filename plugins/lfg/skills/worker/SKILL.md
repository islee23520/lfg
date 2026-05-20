---
name: worker
description: "Sisyphus-Junior category dispatch and team worker protocol (ACK, mailbox, task lifecycle)."
user_invocable: true
---

# Worker — Sisyphus-Junior & Team Protocol

This skill handles the **Sisyphus-Junior** category dispatch and the underlying team worker protocol. Use it when a focused task needs to be executed by a category-specific specialist.

## Usage

```text
/worker ack --task <task-id>
/worker result --task <task-id> --status complete --evidence "..."
```

## Behavior

- **Category Dispatch**: Sisyphus-Junior is spawned for focused tasks (e.g., `quick`, `deep`, `writing`) with a bounded scope.
- **Team Protocol**: Workers use this surface to acknowledge tasks, report results, and update their status in the team tasklist.
- **Evidence Discipline**: Every worker result must include concrete evidence (command output, traces) to satisfy the Oracle review gate.

## Runtime

Backed by `lfg worker`, `lfg spawn`, and MCP `grok_build_worker`.
