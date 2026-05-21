# OMO Agent Definitions (plugins/lfg/src/agents/)

This directory is the **runtime source of truth** for first-class subagents that can be called/spawned in LFG.

## How it works (as of the dynamic registry change)

- Any `*.json` file here with a valid `{"id": "...", ...}` shape is **automatically discovered**.
- `load_omo_agent_registry()` scans the directory (no more hardcoded list for discovery).
- The agents become:
  - Visible in `lfg agents list`
  - Inspectable: `lfg agents inspect <id>`
  - **Callable as subagents**: `lfg spawn <id> [--category X] [--task "..."]`
  - Available to Grok via MCP (`grok_build_omo_agent_catalog` + `grok_build_spawn`)
  - Usable in teams, ultragoal spawns, Hyperplan, etc. (subject to eligibility policy)
- **Autocomplete support**:
  - `lfg agents list --ids` → clean newline-separated list of ids (perfect for `compgen`, scripts, or Grok tool-choice prompts)
  - `lfg agents list --json --ids` → `{"ids": [...]}` for programmatic use

## Policy vs Discovery

- **Discovery** (this dir): purely filesystem driven. Drop a new `my-specialist.json` and it is immediately spawnable + listable.
- **Policy / Contracts** (still in `src/runtime/constants.py`):
  - `CANONICAL_OMO_AGENT_IDS` — the required OMO hierarchy (must all exist)
  - `OMO_PRIMARY_AGENT_IDS`, eligibility maps, hard-reject lists, category profiles, etc.
  - New agents default to "unknown" team eligibility unless explicitly added to the policy tables.

## Adding a new subagent

1. Create `my-agent.json` in this directory following the existing schema (see `sisyphus.json` etc.).
2. Give it a unique `id` that matches the filename stem.
3. (Optional but recommended) Update the policy tables in `constants.py` if you want it to participate in teams, primary routing, etc.
4. Test with `lfg agents list --ids`, `lfg agents inspect my-agent`, `lfg spawn my-agent --task "..." --dry-run` style flows.

## Files here (canonical OMO set)

- sisyphus.json (main orchestrator)
- sisyphus-junior.json (category-bounded executor)
- prometheus.json (planner / interviewer)
- hephaestus.json (autonomous deep worker — special model profile)
- atlas.json (checklist / dependency wave driver)
- oracle.json, librarian.json, explore.json, multimodal-looker.json, metis.json, momus.json (specialist critics / tools)
- builtin-agents.json (policy / factory layer)

Legacy named agents (lina, gonow, iz, grok, ...) live only in `legacy/` for backward compatibility with old team specs. They are **not** part of the OMO registry.

See:
- `docs/agent-system/`
- `docs/ARCHITECTURE.md` (Current Runtime Implementation section)
- `ROADMAP.md` (M4/M5 agent registry + spawn adapter)
