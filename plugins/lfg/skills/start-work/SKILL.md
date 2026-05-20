---
name: start-work
description: "Start or resume Atlas execution for the active plan. Routes through Atlas/Boulder semantics."
user_invocable: true
---

# Start Work — Atlas/Boulder Execution

Use this skill to start or resume work on an active plan. This command triggers the **Atlas** orchestrator to execute the plan's dependency waves, updating the **Boulder** state as progress is made.

## Usage

```text
/start-work
/start-work --plan-id <plan-id>
```

## Behavior

- **Atlas Orchestration**: Atlas reads the plan, identifies the next uncompleted tasks, and dispatches them to specialists.
- **Boulder Persistence**: Progress, evidence, and blockers are recorded in the Boulder state (`.lfg/boulder/`).
- **Verification**: Every task completion requires evidence before the next wave starts.
- **Continuation**: If the session is interrupted, `/start-work` resumes from the last known-good state in Boulder.

## Runtime

Backed by `lfg atlas start-work` and MCP `grok_build_atlas` with `action: "start-work"`.
