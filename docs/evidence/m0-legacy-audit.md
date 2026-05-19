# M0 Legacy Audit: Codex/OMX Reference Inventory

**Branch:** feature/lfg-agent-orchestration-omo-parity
**Date:** 2026-05-18
**Purpose:** Inventory every legacy Codex-derived and OMX reference across docs, skills, tests, metadata, scripts, runtime state, and release evidence. Classify each for the OMO parity migration.

---

## QA Grep Evidence

Command run:

```
rg -i "omx|oh-my-codex|OMX|Codex-derived|codex" --include="*.md" --include="*.py" --include="*.rs" --include="*.sh" --include="*.toml" --include="*.json" --include="*.yml" --include="*.yaml" -l
```

Files with matches (sorted):

```
AGENTS.md
ROADMAP.md
README.md
docs/AGENTS.md
docs/ARCHITECTURE.md
docs/MARKETPLACE_INSTALL.md
docs/MARKETPLACE_RELEASE_NOTES.md
docs/RELEASE_CHECKLIST.md
docs/SMOKE.md
docs/agent-system/README.md
docs/agent-system/categories.md
docs/agent-system/hyperplan-teams.md
docs/agent-system/omo-parity-comparison.md
plugins/lfg/AGENTS.md
plugins/lfg/bin/lfg-mcp.py
plugins/lfg/bin/lfg.py
plugins/lfg/catalog/omo-skill-map.json
plugins/lfg/docs/features/ask-runtime.md
plugins/lfg/docs/features/autopilot-runtime.md
plugins/lfg/docs/features/omx-setup-runtime.md
plugins/lfg/docs/features/ralph-runtime.md
plugins/lfg/docs/omx-feature-map.md
plugins/lfg/skills/ai-slop-cleaner/SKILL.md
plugins/lfg/skills/analyze/SKILL.md
plugins/lfg/skills/ask/SKILL.md
plugins/lfg/skills/autopilot/SKILL.md
plugins/lfg/skills/autoresearch/SKILL.md
plugins/lfg/skills/cancel/SKILL.md
plugins/lfg/skills/configure-notifications/SKILL.md
plugins/lfg/skills/deep-interview/SKILL.md
plugins/lfg/skills/hud/SKILL.md
plugins/lfg/skills/omx-setup/SKILL.md
plugins/lfg/skills/performance-goal/SKILL.md
plugins/lfg/skills/ralph/SKILL.md
plugins/lfg/skills/ralplan/SKILL.md
plugins/lfg/skills/skill/SKILL.md
plugins/lfg/skills/team/SKILL.md
plugins/lfg/skills/ultragoal/SKILL.md
plugins/lfg/skills/visual-ralph/SKILL.md
plugins/lfg/skills/wiki/SKILL.md
plugins/lfg/skills/worker/SKILL.md
scripts/verify-grok-installed-mcp-surface.sh
scripts/verify-installed-lfg-symlink-surface.sh
scripts/verify-marketplace-source.sh
scripts/verify-team-provider-commands.sh
tests/smoke/test_grok_build_runtime.py
```

Total: 45 files with legacy Codex/OMX references.

---

## Classification Legend

| Class | Meaning |
| --- | --- |
| **preserve-contract** | Reference is part of a smoke/release assertion string; must not be changed without updating the corresponding test/script |
| **migrate** | Reference describes legacy behavior that should be replaced with OMO semantics in a future milestone |
| **delete** | Reference is dead weight with no contract value; safe to remove |
| **rename** | Surface name (skill, command, state key) should be renamed as part of a specific milestone |

---

## Inventory by Category

### 1. Root-level docs and metadata

| File | Reference | Class | Notes |
| --- | --- | --- | --- |
| `README.md:44` | `https://github.com/Yeachan-Heo/oh-my-codex` | **preserve-contract** | Marketplace metadata reference; asserted by `scripts/verify-marketplace-source.sh:19` and `tests/smoke/test_grok_build_runtime.py:406`. Do not change until M12 marketplace migration. |
| `README.md:5` | "ports the core oh-my-openagent agent hierarchy" | migrate | Already updated to OMO framing; no action needed. |
| `ROADMAP.md:7` | "no longer a Codex-workflow adaptation" | migrate | Explanatory context; keep as historical note, update when M0 closes. |
| `ROADMAP.md:13` | "Legacy Codex-derived workflow logic is being removed" | migrate | Roadmap intent statement; update to past tense when M0 completes. |
| `ROADMAP.md:99` | "Inventory every legacy Codex-derived reference" | migrate | This task; mark complete when this artifact is merged. |
| `ROADMAP.md:267` | `/omx-setup` preserved transition surface | preserve-contract | Explicitly scheduled for M12 migration; do not rename before M12. |
| `ROADMAP.md:290` | "Legacy Codex-derived workflow identity is removed" | migrate | Exit criterion for M0; update when satisfied. |
| `AGENTS.md:10` | "not legacy Codex-derived workflow identity" | migrate | Policy statement; keep as guard rail. |
| `AGENTS.md:78` | "Do not reintroduce legacy Codex-derived workflow identity" | migrate | Anti-pattern guard; keep. |
| `AGENTS.md:87` | `.omx/` in state exclusion list | migrate | `.omx/` is a legacy state dir; keep in exclusion list until confirmed absent. |

### 2. Docs: architecture, smoke, release

| File | Reference | Class | Notes |
| --- | --- | --- | --- |
| `docs/ARCHITECTURE.md:9` | "supersedes previous Codex-workflow-centered architecture notes" | migrate | Historical note; keep. |
| `docs/SMOKE.md:201` | "oh-my-codex reference" in release notes assertion | **preserve-contract** | `scripts/verify-marketplace-source.sh` asserts `reference: https://github.com/Yeachan-Heo/oh-my-codex`. Breaking this string breaks the smoke gate. |
| `docs/SMOKE.md:289` | `codex` in team provider matrix description | **preserve-contract** | Provider matrix `{hermes, claude, codex, ...}` is asserted by multiple scripts and tests. `codex` here is a provider name (the Codex CLI tool), not legacy workflow identity. |
| `docs/SMOKE.md:308` | `omx-setup` in 28-skill install assertion | **preserve-contract** | `grok-install-smoke.sh` asserts the installed plugin exposes `omx-setup` as one of 28 skills. Renaming requires updating the smoke script and test simultaneously. |
| `docs/RELEASE_CHECKLIST.md:75` | `omx-setup` in checklist | **preserve-contract** | Release gate item; rename only in M12 alongside skill rename. |
| `docs/MARKETPLACE_INSTALL.md:34` | `https://github.com/Yeachan-Heo/oh-my-codex` | **preserve-contract** | Marketplace install reference; same contract as README. |
| `docs/MARKETPLACE_RELEASE_NOTES.md:12` | `oh-my-codex` reference model | **preserve-contract** | Asserted by `scripts/verify-marketplace-source.sh`. |
| `docs/MARKETPLACE_RELEASE_NOTES.md:16` | "OMX-like LFG workflow skills" | migrate | Descriptive text; update to "OMO-parity LFG workflow skills" in M12. |
| `docs/MARKETPLACE_RELEASE_NOTES.md:18` | "Codex worker teams" | migrate | Update to "Grok-native sub-agent teams" in M12. |

### 3. Agent-system docs

| File | Reference | Class | Notes |
| --- | --- | --- | --- |
| `docs/agent-system/README.md:21` | `deep -> codex (or high-reasoning Codex-style)` | migrate | Category-to-model mapping; update to Grok model mapping in M3. |
| `docs/agent-system/categories.md:10` | `codex (or high-reasoning)` for deep category | migrate | Same as above; M3 target. |
| `docs/agent-system/categories.md:33,52,56` | `codex` as preferred provider | migrate | Update to Grok model references in M3. |
| `docs/agent-system/hyperplan-teams.md:50` | `iz gets deep=codex` | migrate | Update in M3 when model mapping is implemented. |
| `docs/agent-system/omo-parity-comparison.md:21,38` | `codex for deep` in model mapping | migrate | Update in M3. |

### 4. Plugin AGENTS.md

| File | Reference | Class | Notes |
| --- | --- | --- | --- |
| `plugins/lfg/AGENTS.md:15` | `catalog/ OMX skill map` | migrate | Update description to "OMO skill catalog" in M12. |
| `plugins/lfg/AGENTS.md:35` | `codex` in supported team providers | **preserve-contract** | `codex` is a valid provider name (Codex CLI); asserted by provider matrix tests. Keep. |

### 5. Skills (plugins/lfg/skills/)

All 20 ported skills share a common boilerplate pattern with these legacy references:

- `description: "LFG port of OMX ..."` in SKILL.md frontmatter
- `source: "oh-my-codex/plugins/oh-my-codex/skills/*/SKILL.md"`
- `source_repo: "https://github.com/Yeachan-Heo/oh-my-codex"`
- Section headers: `## Original OMX Summary`, `## Port Contract`
- Body text referencing "OMX workflow", "Codex goal mode", "OMX state hooks"

| Skill | Class | Notes |
| --- | --- | --- |
| `skills/omx-setup/SKILL.md` | **preserve-contract** + rename (M12) | Skill name `omx-setup` is asserted in smoke (28-skill list, release checklist). Rename to `omo-setup` or `lfg-setup` only in M12 with coordinated script/test update. |
| `skills/team/SKILL.md` | migrate | References `codex` as a provider (valid); OMX framing in description should migrate to OMO framing in M12. |
| `skills/ultragoal/SKILL.md` | migrate | "OMX parity" section; update to "OMO parity" in M12. |
| All other 17 skills | migrate | `source_repo` and `## Original OMX Summary` are informational provenance; migrate to OMO provenance format in M12. No smoke assertions depend on these internal fields. |

**Exact smoke contracts that must not be broken for skills:**
- `docs/SMOKE.md:308` asserts 28 skills including `omx-setup` by name.
- `tests/smoke/test_grok_build_runtime.py:167` asserts `grok_build_omx_setup` MCP tool name.
- `tests/smoke/test_grok_build_runtime.py:1283-1298` asserts `omx-setup check/install-plan/show` CLI surface.

### 6. Runtime: plugins/lfg/bin/

| File | Reference | Class | Notes |
| --- | --- | --- | --- |
| `lfg.py:30` | `CATALOG_PATH = ROOT / "catalog" / "omo-skill-map.json"` | **preserve-contract** | File path is asserted by `lfg-mcp.py` and catalog tests. Renamed with coordinated Python-first smoke/test updates. |
| `lfg.py:1615-1678` | `omx_setup_*` functions, `omx-setup.json` state path | **preserve-contract** | CLI surface `omx-setup check/install-plan/show` is smoke-tested. State key `omxSetup` in JSON is a contract. Rename in M12. |
| `lfg.py:3670-3678` | `omx-setup` subparser registration | **preserve-contract** | Same as above. |
| `lfg-mcp.py:373` | `grok_build_omx_setup` MCP tool name | **preserve-contract** | Asserted by `tests/smoke/test_grok_build_runtime.py:167,1292-1298`. Rename in M12. |
| `lfg-mcp.py` | `omo-skill-map.json` catalog path | **preserve-contract** | Renamed alongside the catalog file and smoke contracts. |
| `lfg-mcp.py:998,1000` | `grok_build_omx_setup` dispatch | **preserve-contract** | Same as MCP tool name. |

### 7. Catalog

| File | Reference | Class | Notes |
| --- | --- | --- | --- |
| `plugins/lfg/catalog/omo-skill-map.json` | File name and contents | **preserve-contract** | Path asserted by `lfg.py:26` and `lfg-mcp.py:556`. Renamed to `omo-skill-map.json` with coordinated runtime, MCP, and smoke updates. |

### 8. Plugin docs (plugins/lfg/docs/)

| File | Reference | Class | Notes |
| --- | --- | --- | --- |
| `docs/omx-feature-map.md` | Entire file is OMX→LFG mapping | migrate | Informational provenance doc; update to OMO→LFG framing in M12. No smoke assertions. |
| `docs/features/omx-setup-runtime.md` | `/omx-setup` feature spec | **preserve-contract** | Describes the `omx-setup` CLI/MCP surface; keep in sync with runtime. Rename in M12. |
| `docs/features/ask-runtime.md:10` | `--provider codex` example | migrate | Example command; update to Grok provider example in M12. |
| `docs/features/autopilot-runtime.md:5` | "OMX-like autopilot" | migrate | Descriptive; update in M12. |
| `docs/features/ralph-runtime.md:5` | "OMX-like Ralph loop" | migrate | Descriptive; update in M12. |

### 9. Scripts

| File | Reference | Class | Notes |
| --- | --- | --- | --- |
| `scripts/verify-marketplace-source.sh:19` | `'reference': 'https://github.com/Yeachan-Heo/oh-my-codex'` | **preserve-contract** | Exact assertion string. Must not change until M12 marketplace migration. |
| `scripts/verify-team-provider-commands.sh:14,25,30,36,40` | `codex` in provider set and command assertions | **preserve-contract** | `codex` is a valid provider (Codex CLI tool). These assertions define the provider matrix contract. |
| `scripts/verify-installed-lfg-symlink-surface.sh:32` | `codex` in expected provider set | **preserve-contract** | Same as above. |
| `scripts/verify-grok-installed-mcp-surface.sh:39` | `codex` in team payload assertion | **preserve-contract** | Same as above. |

### 10. Tests

| File | Reference | Class | Notes |
| --- | --- | --- | --- |
| `tests/smoke/test_grok_build_runtime.py:167` | `grok_build_omx_setup` in MCP tool list | **preserve-contract** | Smoke assertion; rename only in M12. |
| `tests/smoke/test_grok_build_runtime.py:406` | `https://github.com/Yeachan-Heo/oh-my-codex` metadata reference | **preserve-contract** | Exact URL assertion; rename in M12. |
| `tests/smoke/test_grok_build_runtime.py:500,504,506,688,692,705,706` | `codex` as provider name | **preserve-contract** | Provider matrix contract; `codex` here is the Codex CLI provider, not legacy workflow identity. Keep. |
| `tests/smoke/test_grok_build_runtime.py:995` | "OMX-parity ultragoal surface" comment | migrate | Comment only; update in M12. |
| `tests/smoke/test_grok_build_runtime.py:1283-1298` | `omx-setup` CLI and MCP surface tests | **preserve-contract** | Full smoke coverage of `omx-setup` surface. Rename in M12 with coordinated runtime change. |
| `tests/smoke/test_grok_build_runtime.py:1530-1533` | `codex` provider in ask test | **preserve-contract** | Provider contract; keep. |
| `tests/smoke/test_grok_build_runtime.py:1673` | `oh-my-codex` URL in autoresearch source test | **preserve-contract** | Exact URL used as test fixture; keep until M12. |

---

## Smoke/Release Contracts That Must Not Be Broken

The following exact strings are asserted by smoke tests or release scripts. Any migration touching these must update the assertion and the surface atomically:

1. `https://github.com/Yeachan-Heo/oh-my-codex` — marketplace metadata reference URL
   - Asserted by: `scripts/verify-marketplace-source.sh:19`, `tests/smoke/test_grok_build_runtime.py:406`, `tests/smoke/test_grok_build_runtime.py:1673`
   - Files containing it: `README.md`, `docs/MARKETPLACE_INSTALL.md`, `docs/MARKETPLACE_RELEASE_NOTES.md`, all skill `source_repo` fields

2. `grok_build_omx_setup` — MCP tool name
   - Asserted by: `tests/smoke/test_grok_build_runtime.py:167,1292-1298`
   - Files containing it: `plugins/lfg/bin/lfg-mcp.py`

3. `omx-setup` — CLI subcommand and skill name
   - Asserted by: `tests/smoke/test_grok_build_runtime.py:1283-1298`, `docs/RELEASE_CHECKLIST.md:75`, `docs/SMOKE.md:308`
   - Files containing it: `plugins/lfg/bin/lfg.py`, `plugins/lfg/skills/omx-setup/SKILL.md`, `plugins/lfg/docs/features/omx-setup-runtime.md`

4. `omo-skill-map.json` — catalog file path
   - Asserted by: `plugins/lfg/bin/lfg.py:26`, `plugins/lfg/bin/lfg-mcp.py:556,562`
   - Files containing it: `plugins/lfg/catalog/omo-skill-map.json`

5. Provider set `{hermes, claude, codex, gemini, copilot, opencode, grok, subagent, noop}` — team provider matrix
   - Asserted by: `scripts/verify-team-provider-commands.sh`, `scripts/verify-installed-lfg-symlink-surface.sh`, `scripts/verify-grok-installed-mcp-surface.sh`, `tests/smoke/test_grok_build_runtime.py:692`
   - Note: `codex` here is the Codex CLI provider name, not legacy workflow identity. This contract is valid and should be preserved.

6. 28-skill install surface including `omx-setup`
   - Asserted by: `docs/SMOKE.md:308`, `grok-install-smoke.sh`

---

## Migration Summary by Milestone

| Milestone | Action |
| --- | --- |
| **M0 (now)** | This audit artifact. No runtime changes. |
| **M3** | Update `docs/agent-system/` model mapping from `codex` to Grok model references. |
| **M12** | Keep `omx-setup` compatibility while catalog internals use `omo-skill-map.json`. Update marketplace metadata reference URL. Update all skill `source_repo` and `## Original OMX Summary` sections to OMO provenance. Update `docs/MARKETPLACE_RELEASE_NOTES.md` OMX-like language. All changes must be atomic with corresponding smoke/test updates. |

---

## Items Safe to Delete (no contract dependency)

- `plugins/lfg/docs/features/autopilot-runtime.md:5` "OMX-like" phrasing (descriptive only)
- `plugins/lfg/docs/features/ralph-runtime.md:5` "OMX-like" phrasing (descriptive only)
- `plugins/lfg/docs/features/ask-runtime.md:10` `--provider codex` example (can be updated to Grok example)
- Comment at `tests/smoke/test_grok_build_runtime.py:995` "OMX-parity" (comment only, no assertion)

These can be updated in any milestone without breaking contracts.
