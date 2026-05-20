---
name: ulw
description: "Activate full OMO-style Ultrawork mode: Sisyphus-led autonomous execution with Boulder persistence."
user_invocable: true
---

# ULW — Ultrawork Mode

Activate the **Sisyphus** orchestrator for autonomous, high-throughput task completion. ULW mode uses the **IntentGate** to detect complex goals and dispatches a swarm of specialists to execute them.

## Usage

```text
/ulw "your goal"
ulw "your goal"
```

## Behavior

- **Sisyphus Lead**: Sisyphus owns the intent, dispatches specialists, and verifies completion.
- **Boulder Persistence**: The "boulder" (current goal state) is updated in real-time.
- **Autonomous Swarm**: Spawns a team of workers (Grok sub-agents or external providers) to work in parallel.
- **Never Stops**: Continues until the acceptance criteria are met or a hard blocker is encountered.

## Runtime

Backed by `lfg ulw`, `ulw` binary, and MCP `grok_build_ultrawork`.
