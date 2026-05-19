# lfg Wiki

**OMO agent hierarchy parity for Grok Build**

Welcome to the official wiki for `linalab-io/lfg`.

This wiki contains the living documentation for how the OMO agent system is ported into Grok Build, how Team Mode works, how verification gates are enforced, and how to contribute.

## Quick Links

- [How It Works](./How-It-Works.md) — End-to-end runtime overview
- [Architecture](./Architecture.md) — Current implementation and vision
- [Agent Hierarchy](./Agent-Hierarchy.md) — The 6 canonical OMO agents
- [Team Mode](./Team-Mode.md) — Multi-agent orchestration with durable state
- [Verification & Smoke](./Verification.md) — Evidence contracts and release gates
- [Release Process](./Release-Process.md) — Checklist before merge/tag
- [Development Guide](./Development-Guide.md) — Local setup and contribution

## Core Principles

- Current code is the Single Source of Truth.
- All first-class agents resolve to Grok models.
- Team Mode (`team_mode.enabled=true`) is the active coordination layer.
- Exact evidence strings (`*=ok`) are product contracts.
- No legacy Codex workflow identity is preserved as the north star.

## Status

- Branch: `feature/lfg-agent-orchestration-omo-parity`
- Team Mode: **Enabled**
- Current focus: OMO parity + Grok-native spawn adapter

---

**Last updated**: May 2026
