---
name: cancel
description: "Cancel any active LFG mode (ulw, ralph, team, atlas, etc.) and record the cancellation state."
user_invocable: true
---

# Cancel — Stop Active Execution

Use this skill to cancel any active LFG execution mode. This command stops the current goal, plan, or team execution and records the cancellation in the state.

## Usage

```text
/cancel
```

## Behavior

- **Immediate Stop**: Signals active agents and background processes to stop execution.
- **State Recording**: Records the cancellation event in `.lfg/state/last-cancel.json`.
- **Cleanup**: Performs necessary cleanup of temporary files or runtime state.

## Runtime

Backed by `lfg cancel` and MCP `grok_build_cancel`.
