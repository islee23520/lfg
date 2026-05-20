---
name: setup
description: "Install/sync the LFG Grok plugin and configure provider/model metadata."
user_invocable: true
---

# Setup — LFG Plugin Configuration

Use this skill to install or sync the LFG plugin and configure your AI providers and model profiles.

## Usage

```text
/setup
/setup --interactive
```

## Behavior

- **Plugin Sync**: Syncs the current plugin package into your Grok plugins directory.
- **Provider Wizard**: In interactive mode, runs the OMO-style provider/subscription wizard for OpenAI, Z.ai, Copilot, and Codex. These are bounded execution/consultation lanes only; xAI/Grok remains the mandatory Oracle gate.
- **Auth Login**: Configures provider login metadata (environment variable names) without storing actual secrets.

## Runtime

Backed by `lfg setup`, `lfg auth login`, and MCP `setup`.
