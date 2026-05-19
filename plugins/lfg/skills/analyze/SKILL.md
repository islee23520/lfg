---
name: analyze
description: "LFG port of OMX `analyze`: Run read-only deep repository analysis and return a ranked synthesis with explicit confidence, concrete file references, and clear evidence-vs-inference boundaries. Use when a user says 'analyze', 'investigate', 'why does', 'what's causing', or needs grounded cross-file explanation before any changes are proposed."
user_invocable: true
metadata:
  package: "linalab-io/lfg"
  source: "oh-my-codex/plugins/oh-my-codex/skills/analyze/SKILL.md"
  source_repo: "https://github.com/Yeachan-Heo/oh-my-codex"
  port_kind: "grok-skill-adapter"
---

# Analyze — LFG Port

LFG port of the OMX `analyze` skill from oh-my-codex. Runtime: `lfg analyze`, deep repo analysis via MCP `grok_build_analyze`.
