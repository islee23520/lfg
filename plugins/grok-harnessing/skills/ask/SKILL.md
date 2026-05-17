---
name: ask
description: "Grok Build port of OMX `ask`: Ask a local external advisor CLI (Claude or Gemini) and capture a reusable artifact"
user_invocable: true
metadata:
  package: "linalab-io-framework/grok-build"
  source: "oh-my-codex/plugins/oh-my-codex/skills/ask/SKILL.md"
  source_repo: "https://github.com/Yeachan-Heo/oh-my-codex"
  port_kind: "grok-skill-adapter"
---

# Ask (Local Advisor CLI) — Grok Build Port

This skill is the Grok Build adaptation of the OMX `ask` workflow from `oh-my-codex`.

## Port Contract

- Preserve the user-facing OMX intent and command name as closely as Grok plugin skills allow.
- Use Grok-native tools, slash commands, subagents, MCP servers, hooks, and `~/.grok/plugin-data/grok-build/` state instead of Codex-specific internals.
- Keep evidence-first behavior: inspect local artifacts, run bounded commands, record results, and report concrete verification.
- Do not assume Codex-only commands such as `omx ...` exist inside Grok unless the user explicitly wants interop with an installed OMX CLI.
- If the original workflow depends on Codex goal mode, tmux orchestration, or OMX state hooks, translate it into Grok-visible state files and explicit checklist gates.

## Original OMX Summary

- Source skill: `oh-my-codex/plugins/oh-my-codex/skills/ask/SKILL.md`
- Original description: Ask a local external advisor CLI (Claude or Gemini) and capture a reusable artifact

## Grok Execution Rules

1. Restate the goal and success criteria.
2. Build a concise scenario/checklist before mutating files.
3. Use repo-local evidence and Grok tools first.
4. Run the smallest meaningful verification command or harness.
5. Store durable workflow notes under `~/.grok/plugin-data/grok-build/ask/` when state is needed.
6. Finish with changed files, commands run, pass/fail evidence, and residual risk.

## Source-Informed Workflow Notes

The complete upstream wording is intentionally not copied verbatim. This adapter tracks the OMX workflow identity and translates it into Grok-native operation. For exact upstream behavior, compare against the source repository and then implement only the pieces that make sense in Grok Build.
