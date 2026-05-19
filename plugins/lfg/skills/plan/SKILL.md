---
name: plan
description: "LFG port of OMX `plan`: Strategic planning with optional interview workflow"
user_invocable: true
metadata:
  package: "linalab-io/lfg"
  source: "oh-my-codex/plugins/oh-my-codex/skills/plan/SKILL.md"
  source_repo: "https://github.com/Yeachan-Heo/oh-my-codex"
  port_kind: "grok-skill-adapter"
---

# Plan — LFG Port

LFG port of the OMX `plan` skill from oh-my-codex.

**Where plans live**: When you create a plan through LFG (via `/plan`, the `plan` skill, `lfg plan create`, `grok_build_plan`, or Prometheus), the plan is written into the **current project's `.lfg/plans/` folder** as both:

- `<id>.json` — structured durable record
- `<id>.md` — human-readable Markdown you (and agents) can open and work on directly

This keeps plans inside the project (nested under `.lfg/plans/`) so they are version-controllable with the repo and survive across sessions, matching OMO-style durable planning.

Runtime provided by `lfg plan`, MCP `grok_build_plan`, and plugin surfaces.
