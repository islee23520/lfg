---
name: lfg
description: Stress-test and harden LFG-compatible plugin surfaces: skills, hooks, MCP/LSP configs, marketplace metadata, and Claude Code / AGENTS compatibility.
user_invocable: true
metadata:
  short-description: "Hammer Grok extension surfaces"
  package: "islee23520/lfg"
---

# LFG

Use this skill when validating the `islee23520/lfg` plugin package.

## Mission

Build evidence, not vibes. Exercise every extension surface with fixture-backed checks:

1. Discover plugin manifests from Grok and Claude-compatible roots.
2. Discover skills and expose user-invocable slash commands.
3. Replay hook lifecycle events with bounded timeouts and fail-open behavior.
4. Load MCP and LSP config placeholders without escaping the plugin root.
5. Verify marketplace metadata points at this plugin package.

## Required Evidence

- exact plugin root
- manifest path used (`.grok-plugin` preferred, `.claude-plugin` fallback)
- discovered skill names
- hook event replay result and log path
- MCP/LSP config path status
- command outputs from the local verifier

## Safety Rules

- Never execute hook scripts without a timeout.
- Never allow `..` or absolute manifest paths to escape the plugin root.
- Never trust project hooks unless the project is explicitly trusted.
- Redact secrets before writing hook logs.
