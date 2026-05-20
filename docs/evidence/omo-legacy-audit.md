# OMO Parity M0 Legacy Audit

## Purpose

Inventory legacy Codex/OMX-derived references before implementing OMO agent hierarchy parity for Grok Build.

## Acceptance Criteria

- Concrete paths are listed.
- Each reference is classified as `preserve-contract`, `migrate`, `delete`, or `rename`.
- Smoke/release contracts that must not break are identified.
- QA grep command is recorded.

## QA Grep

```sh
grep -R "omx\|oh-my-openagent\|OMX\|Codex-derived" . --include='*.py' --include='*.md' --include='*.json' --include='*.sh' --include='*.toml'
```

Current broad scan found legacy references in docs, skills, tests, metadata, scripts, runtime, catalog, and feature docs. This file is the phase-zero triage map, not the deletion patch.

## Preserve-Contract

These are currently asserted by smoke/release tests or metadata verification. Do not remove without matching test/script changes.

| Path | Reason |
| --- | --- |
| `README.md` | Current marketplace metadata reference URL must appear for `self-test.sh`. |
| `ROADMAP.md` | Preserved release evidence strings are asserted by `tests/smoke/test_grok_build_runtime.py`. |
| `docs/MARKETPLACE_RELEASE_NOTES.md` | Release-note evidence contract. |
| `docs/MARKETPLACE_INSTALL.md` | Marketplace metadata compatibility contract. |
| `docs/SMOKE.md` | Documents smoke/release evidence strings. |
| `tests/smoke/test_grok_build_runtime.py` | Product-contract assertions; do not weaken to make docs pass. |
| `plugins/lfg/bin/self-test.sh` | Local bundle verification and release evidence. |
| `plugins/lfg/catalog/omo-skill-map.json` | Transition catalog until skills are migrated to OMO semantics. |
| `plugins/lfg/docs/` | Obsolete plugin-local feature docs, removed from the current smoke contract. |
| `plugins/lfg/skills/*/SKILL.md` | Current installed skill surface; migrate in M12 rather than mass-delete. |

## Migrate

| Path | Migration Target |
| --- | --- |
| `plugins/lfg/skills/*/SKILL.md` | Rewrite frontmatter and body to OMO agent semantics. |
| `plugins/lfg/bin/lfg.py` | Move command semantics toward agent registry, spawn adapter, Boulder, Team Mode, Hyperplan. |
| `plugins/lfg/bin/lfg-mcp.py` | Expose OMO registry/spawn/state tools while preserving JSON-RPC stdout isolation. |
| `plugins/lfg/hooks/scripts/lfg-goal-harness.py` | Inject OMO Boulder/continuation context instead of legacy workflow context. |
| `plugins/lfg/src/agents/legacy/*.json` | Convert named agents to Grok-first OMO family/profile mapping. |
| `docs/agent-system/*.md` | Align with full OMO parity and Grok-model-only first-class agents. |

## Rename

| Current | Candidate |
| --- | --- |
| `catalog/omo-skill-map.json` | `catalog/omo-surface-map.json` after tests and metadata migrate. |
| `plugins/lfg/docs/omx-feature-map.md` | `plugins/lfg/docs/omo-runtime-map.md`. |
| `/omx-setup` skill/runtime | OMO setup or agent setup equivalent; decide in M0 open decision. |

## Delete

Plugin-local docs were deleted once the smoke contract moved to active root docs and runtime assertions.

| Candidate | Condition |
| --- | --- |
| Unused Codex-specific source links in skill frontmatter | Safe after OMO skill docs replace transition skill docs. |
| Legacy setup commands with no OMO equivalent | Safe after deprecated alias window decision. |
| Transition catalog rows that no runtime uses | Safe after `lfg catalog` and MCP tests update. |

## Non-Breaking Evidence Strings

Keep these until the corresponding tests/scripts are migrated:

```text
marketplace-source=ok
grok-plugins-surface=ok
grok-plugin-hook-scope=not-observed
grok-global-hook-bridge=ok
grok-installed-mcp-surface=ok
lfg-installed-symlink-surface=ok
aliases=lfg,ulw
lfg-inside-tmux-status=ok
lfg hook-bridge status/install
MCP `grok_build_hook_bridge`
release-tag=ok
release-notes=ok
state-schema-versioning=ok
mcp-stdio-isolation=ok
team-tmux-lifecycle=ok
team-preflight-cli=ok
team-preflight-commands=ok
team-provider-matrix=ok
team-provider-slash=ok
team-provider-commands=ok
runtime-smoke-coverage=100%
```

## Implementation Implication

M0 is not complete until every legacy reference is either preserved as a contract, mapped to an OMO replacement, explicitly scheduled for rename, or scheduled for deletion with a test migration.
