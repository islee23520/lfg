---
name: plan
description: "Strategic planning with Prometheus: Interview-mode planning that produces verifiable plans."
user_invocable: true
---

# Plan — Prometheus Strategic Planning

Use this skill to invoke **Prometheus** for strategic planning. Prometheus will interview you to clarify scope, read the codebase context, and produce a verifiable plan before implementation starts.

## Usage

```text
/plan "your objective"
/plan create "your objective" --steps "step1;step2;step3"
```

## Behavior

- **Prometheus Interview**: Prometheus asks clarifying questions to ensure the plan matches your intent.
- **Durable Plans**: Plans are stored in `.lfg/plans/` as both JSON (durable record) and Markdown (human-readable).
- **Verifiable Steps**: Every step in the plan includes explicit success criteria.
- **Atlas Ready**: Plans produced by Prometheus are designed to be executed by the **Atlas** orchestrator via `/start-work`.

## Runtime

Backed by `lfg plan`, MCP `plan`, and the Prometheus agent.
