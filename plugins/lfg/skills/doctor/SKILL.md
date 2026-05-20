---
name: doctor
description: "Diagnose and fix LFG plugin state, schema, and provider configuration issues."
user_invocable: true
---

# Doctor — LFG Self-Diagnostics

Use this skill to diagnose and fix issues with your LFG installation, state schema, or provider configurations.

## Usage

```text
/doctor
/doctor state schema check
```

## Behavior

- **State Validation**: Checks the integrity of `.lfg/` state files and ensures they match the current schema version.
- **Provider Preflight**: Verifies that configured providers (OpenAI, xAI, etc.) are reachable and correctly authenticated.
- **Environment Audit**: Checks for required binaries (tmux, git, python) and environment variables.

## Runtime

Backed by `lfg doctor` and MCP `grok_build_doctor`.
