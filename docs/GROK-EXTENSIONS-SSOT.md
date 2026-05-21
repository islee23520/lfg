# Grok Extensions SSOT Working Guide

**Status**: Single source of truth for Grok extension discovery, compatibility roots, and LFG plugin packaging guidance.

**Last updated**: 2026-05-20

This guide organizes the Grok extension model used by LFG: skills, plugins, hooks, marketplaces, MCP servers, subagents, Claude Code compatibility, and AGENTS.md compatibility.

Use this document for extension discovery and packaging rules. Use `ARCHITECTURE.md` for actual LFG runtime behavior, `reference.md` for official xAI/Grok platform claims, and `SMOKE.md` for verification gates.

## 1. Scope and Source-of-Truth Boundaries

This document is the SSOT for:

- Where Grok discovers skills, plugins, hooks, marketplace sources, and compatibility files.
- Which extension surfaces are user-invocable inside the TUI.
- How LFG should package Grok-native and compatibility surfaces.
- Which verification path proves each extension class is discoverable.

This document is **not** the SSOT for:

- xAI Responses API behavior or Grok-native platform primitives. Use `reference.md`.
- Whether LFG's OMO spawn adapter has replaced fallback/manual-gated execution. Use `ARCHITECTURE.md` and `evidence/grok-subagent-spawning.md`.
- Exact smoke evidence strings. Use `SMOKE.md` and `RELEASE_CHECKLIST.md`.

## 2. Skills

Skills are reusable folders containing markdown instructions, script files, and resources for agents.

Grok discovers skills from:

- `./.grok/skills/`, walked upward from the current working directory to the repo root.
- `~/.grok/skills/`.
- Any enabled plugin's `skills/` directory.
- Extra paths under `[skills] paths` in `~/.grok/config.toml`.

User-invocable skills also appear as slash commands, for example:

```text
/<skill-name>
```

### LFG packaging rule

LFG plugin skills live under:

```text
plugins/lfg/skills/*/SKILL.md
```

When adding or changing a user-facing LFG skill:

1. Keep the skill folder self-contained: `SKILL.md`, optional scripts, optional resources.
2. Keep slash-command semantics aligned with the OMO agent hierarchy in `ARCHITECTURE.md`.
3. Verify plugin discovery through the plugin smoke path before claiming the skill is available in Grok.

## 3. Plugins

Plugins extend Grok with additional skills, agents, hooks, MCP servers, and LSP servers.

Grok loads plugins from:

- `./.grok/plugins/`.
- `~/.grok/plugins/`.
- Marketplace installs under `~/.grok/plugins/marketplaces/`.
- Extra paths under `[plugins] paths` in `~/.grok/config.toml`.
- `--plugin-dir <PATH>` on the CLI.

Inside the TUI, manage plugins, hooks, skills, and MCP servers from a single extensions modal. The same modal is opened by any of:

```text
/plugins
/hooks
/skills
/mcps
```

### LFG packaging rule

LFG's Grok plugin package is rooted at:

```text
plugins/lfg/
```

Canonical plugin surfaces include:

```text
plugins/lfg/.grok-plugin/plugin.json
plugins/lfg/skills/*/SKILL.md
plugins/lfg/hooks/hooks.json
plugins/lfg/.mcp.json
plugins/lfg/bin/lfg-mcp.ts
plugins/lfg/src/runtime-ts/index.ts
```

Compatibility surfaces are allowed only when they mirror the same product identity and do not replace the Grok package as the canonical path.

## 4. Hooks

Hooks run scripts on tool and session lifecycle events, such as before or after tool calls.

Grok discovers hooks from:

- `~/.grok/hooks/`.
- Extra hook roots via `~/.grok/hooks-paths`.
- Project `.grok/hooks/`, after the project has been trusted with `/hooks-trust`.
- Enabled plugins.

All hooks receive:

```text
GROK_HOOK_EVENT
GROK_HOOK_NAME
GROK_SESSION_ID
GROK_WORKSPACE_ROOT
```

Plugin hooks also receive:

```text
GROK_PLUGIN_ROOT
GROK_PLUGIN_DATA
```

Runner-provided and plugin-provided environment values take precedence over any `env` declared in the hook definition.

The in-app Hooks guide remains the detailed reference for expansion rules and full hook semantics.

### LFG packaging rule

LFG plugin hook definitions live at:

```text
plugins/lfg/hooks/hooks.json
```

Hook scripts must keep MCP/stdout contracts clean. In particular, MCP servers must emit JSON-RPC on stdout only; diagnostics belong on stderr.

## 5. Marketplaces

The TUI includes a Marketplace tab for browsing and installing plugins from configured sources.

Marketplace sources come from:

- `[[marketplace.sources]]` in `~/.grok/config.toml`.
- `~/.grok/plugins/known_marketplaces.json`.

### LFG packaging rule

LFG's marketplace identity remains:

```text
Marketplace: islee23520
Package:     islee23520/lfg
Plugin id:   lfg
```

Primary marketplace metadata lives at:

```text
.grok/plugins/marketplace.json
```

Compatibility marketplace metadata may live at:

```text
.agents/plugins/marketplace.json
```

The intended product install path is marketplace install from Grok. Local editable install is for development and preview only.

## 6. Subagents

Subagents spawn independent child sessions that handle tasks in parallel.

For LFG, this product concept maps to the OMO agent hierarchy:

- Sisyphus delegates and verifies.
- Sisyphus-Junior executes bounded category work.
- Prometheus plans.
- Atlas runs dependency waves.
- Hephaestus handles autonomous deep goals.

Current LFG implementation status must be read from `ARCHITECTURE.md`. Do not claim real Grok-native subagent spawning is the default LFG path until `evidence/grok-subagent-spawning.md` and the relevant smoke gates say so.

## 7. Claude Code Compatibility

Grok is compatible with Claude Code extension and instruction surfaces with zero extra setup.

Grok automatically reads Claude Code marketplaces, plugins, skills, MCPs, agents, hooks, and instruction files alongside `.grok/` sources, including:

```text
CLAUDE.md
Claude.md
CLAUDE.local.md
.claude/rules/
```

### LFG packaging rule

Claude-compatible files may exist as mirrors for compatibility, but they must not introduce a separate product identity or contradict Grok-first docs.

## 8. AGENTS.md Compatibility

Grok reads the AGENTS.md instruction-file family, walked from the current working directory to the repo root:

```text
AGENTS.md
Agents.md
AGENT.md
```

Grok also discovers user-level skills and commands from:

```text
~/.agents/skills/
~/.agents/commands/
```

### LFG packaging rule

Project instructions remain rooted in `AGENTS.md` files. More deeply nested AGENTS files override parent guidance for files in their subtree. Do not create per-skill AGENTS files under `plugins/lfg/skills/*`; the project-level guidance covers those directories.

## 9. Working Guide for Extension Changes

When adding or modifying any extension surface:

1. Identify the surface: skill, plugin manifest, hook, MCP server, LSP server, marketplace metadata, agent definition, or compatibility mirror.
2. Put the canonical Grok file in the `.grok` or plugin path listed above.
3. Add compatibility mirrors only when they are required for Claude Code or AGENTS compatibility.
4. Keep product identity aligned with `islee23520/lfg` and the OMO parity goal.
5. Update `docs-index.json` if a new docs file is added.
6. Update `SMOKE.md` or `RELEASE_CHECKLIST.md` only when the verification contract or evidence strings change.
7. Run the appropriate verification gate before claiming discoverability.

## 10. Verification Map

Use the smallest gate that proves the extension class changed:

| Extension class | Primary verification |
| --- | --- |
| Plugin package shape | `bun plugins/lfg/bin/self-test.ts` |
| Skill count/discovery | `bun plugins/lfg/bin/self-test.ts` and `plugins/lfg/bin/lfg doctor` |
| MCP stdio isolation | `bun plugins/lfg/bin/self-test.ts` MCP stdio section |
| Marketplace metadata | `docs/MARKETPLACE_INSTALL.md` and marketplace smoke path |
| Real Grok install/discovery | `grok-install-smoke.py` removed in TS cutover, manual Grok gate pending |
| Runtime agent/spawn behavior | `ARCHITECTURE.md`, `SMOKE.md`, and `evidence/grok-subagent-spawning.md` |

Never report an extension as working only because the file exists. It is working only after the matching discovery or runtime surface has been exercised.
