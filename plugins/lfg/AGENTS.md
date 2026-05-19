# plugins/lfg/AGENTS.md

## OVERVIEW
Grok/LFG plugin package. This directory owns manifests, skill surfaces, hook registration, MCP tools, feature docs, and the dependency-free Python runtime that backs local smoke tests.

## STRUCTURE
```text
plugins/lfg/
  .grok-plugin/plugin.json     Grok package manifest
  .claude-plugin/plugin.json   Compatibility manifest
  .mcp.json                    MCP server config
  bin/                         Runtime, wrappers, self-test
  skills/*/SKILL.md            Slash command surfaces
  hooks/                       Hook registration and scripts
  catalog/                     OMX skill map
  docs/features/               Runtime feature contracts
```

## WHERE TO LOOK
- `bin/lfg.py`: Main runtime, state schema, goals, plans, team backend, hook bridge, slash parser.
- `bin/lfg`: Default `lfg` wrapper for tmux backend launch.
- `bin/ulw`: Specialized ultragoal launcher alias.
- `bin/lfg-mcp.py`: Stdio JSON-RPC server exposing `grok_build_*` tools.
- `bin/self-test.sh`: Local smoke bundle and manifest/evidence assertions.
- `hooks/scripts/lfg-goal-harness.py`: Hook-side active-goal and boulder prompt injection hotspot.
- `hooks/scripts/lfg-goal-harness.sh`: Fail-open wrapper for the Python harness.
- `src/agents/*.json`: Named team agent definitions (canonical).
- `src/agents/harness.toml`: Harness config surfaced by self-test (canonical).

## CONVENTIONS
- `lfg.py` must remain dependency-free: Python stdlib only.
- Resolve package paths with `GROK_PLUGIN_ROOT`; resolve runtime data with `GROK_PLUGIN_DATA` or `.lfg`.
- Use `validate_safe_id` and `safe_child_path` for user-controlled filesystem names.
- Team mode is tmux-backed. Provider commands and preflight output are tested as contracts.
- Supported team providers include `hermes`, `claude`, `codex`, `gemini`, `copilot`, `opencode`, `grok`, `subagent`, and `noop`.
- `grok` and `subagent` represent native Grok sub-agents; external CLI providers are discovered/preflighted separately.
- `lfg-mcp.py` stdout must be JSON-RPC only. Put diagnostics on stderr or in returned JSON.
- Hook harnesses must stay fail-open and bounded. A hook failure must not break the host session.
- Preserve legacy flat team-state compatibility when changing team storage or `TeamStateStore`.
- Each non-harness skill should have a matching `docs/features/*-runtime.md` row covered by smoke tests.

## ANTI-PATTERNS
- Do not add external imports that break marketplace users with only system Python.
- Do not duplicate slash parsing in prompt text when `lfg slash` or MCP tools already expose it.
- Do not bypass `.lfg` state schema creation when writing durable state.
- Do not allow `..` or absolute manifest paths to escape the plugin root.
- Do not trust project hooks unless the project is explicitly trusted.
- Do not let hook scripts leak token-like strings into audit logs.
- Do not create per-skill local AGENTS files.

## COMMANDS
```sh
plugins/lfg/bin/self-test.sh
python3 plugins/lfg/bin/lfg.py status
python3 plugins/lfg/bin/lfg-mcp.py
```

## NOTES
- `bin/lfg.py`, `bin/lfg-mcp.py`, and `hooks/scripts/lfg-goal-harness.py` are the largest implementation hotspots. Prefer narrow edits with focused smoke coverage.
- `bin/self-test.sh` asserts many docs and scripts by literal evidence strings.
- Recent launch evidence uses `lfg-inside-tmux-status=ok`, not the older implicit attach wording.
