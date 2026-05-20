---
name: ralph
description: "Durable self-referential development loop that continues until the objective is met."
user_invocable: true
---

# Ralph — Persistence Loop

Activate the **Ralph** loop for persistent, self-referential development. Ralph continues to iterate on a task, verifying progress at each step, until the stop condition is met.

## Usage

```text
/ralph "your objective"
/ralph --max-iterations 10
```

## Behavior

- **Self-Referential**: Ralph reads its own previous output and state to decide the next move.
- **Durable State**: The loop state is stored in `.lfg/state/ralph/`, allowing it to survive session restarts.
- **Verification Gate**: Each iteration is verified against the objective and success criteria.
- **Stop Conditions**: Stops when the goal is achieved, a hard blocker is found, or the maximum iterations are reached.

## Runtime

Backed by `lfg ralph` and MCP `grok_build_ralph`.
