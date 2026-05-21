# plugins/lfg/AGENTS.md

## OVERVIEW
Grok/LFG plugin package. This directory owns manifests, skill surfaces, hook registration, MCP tools, and the dependency-free TypeScript/Bun runtime that backs local smoke tests.

## STRUCTURE
```text
plugins/lfg/
  .grok-plugin/plugin.json     Grok package manifest
  .claude-plugin/plugin.json   Compatibility manifest
  .mcp.json                    MCP server config
  bin/                         Runtime, wrappers, self-test
  skills/*/SKILL.md            Slash command surfaces
  hooks/                       Hook registration and scripts
  catalog/                     OMO skill map
```

## WHERE TO LOOK
- `bin/lfg.ts`: Main runtime, state schema, goals, plans, team backend, hook bridge, slash parser.
- `bin/lfg`: Default `lfg` wrapper for tmux backend launch.
- `bin/ulw`: Specialized ultragoal launcher alias.
- `bin/lfg-mcp.ts`: Stdio JSON-RPC server exposing canonical short MCP tool names; `grok_build_*` aliases remain compatibility-only in dispatch.
- `bin/self-test.ts`: Local smoke bundle and manifest/evidence assertions.
- `hooks/scripts/lfg-goal-harness.ts`: Thin router delegating to `src/hooks-ts/` (modular OMO-style hook implementation).
- `src/agents/*.json`: Named team agent definitions (canonical).
- `src/agents/harness.toml`: Harness config surfaced by self-test (canonical).

## CONVENTIONS
- `lfg.ts` must remain dependency-free: Bun/TypeScript runtime only.
- Resolve package paths with `GROK_PLUGIN_ROOT`; resolve runtime data with `GROK_PLUGIN_DATA` or `.lfg`.
- Use `validate_safe_id` and `safe_child_path` for user-controlled filesystem names.
- Team mode is tmux-backed. Provider commands and preflight output are tested as contracts.
- Supported team providers include `hermes`, `claude`, `codex`, `gemini`, `copilot`, `opencode`, `grok`, `subagent`, and `noop`.
- `grok` and `subagent` represent Grok sub-agent fallback lanes for dependency-free runtime paths; real host child-spawn evidence is tracked by the T28 manual gate, and external CLI providers are discovered/preflighted separately.
- `lfg-mcp.ts` stdout must be JSON-RPC only. Put diagnostics on stderr or in returned JSON.
- Hook harnesses must stay fail-open and bounded. A hook failure must not break the host session.
- Preserve legacy flat team-state compatibility when changing team storage or `TeamStateStore`.

## ANTI-PATTERNS
- Do not add external imports that break marketplace users with only the dependency-light Bun/TypeScript runtime.
- Do not duplicate slash parsing in prompt text when `lfg slash` or MCP tools already expose it.
- Do not bypass `.lfg` state schema creation when writing durable state.
- Do not allow `..` or absolute manifest paths to escape the plugin root.
- Do not trust project hooks unless the project is explicitly trusted.
- Do not let hook scripts leak token-like strings into audit logs.
- Do not create per-skill local AGENTS files.

## COMMANDS
```sh
bun plugins/lfg/bin/self-test.ts
bun plugins/lfg/bin/lfg.ts --json status
bun plugins/lfg/bin/lfg-mcp.ts
```

## NOTES
- `bin/lfg.ts`, `bin/lfg-mcp.ts`, and `src/hooks-ts/` are the largest implementation hotspots. Prefer narrow edits with focused smoke coverage.
- `bin/self-test.ts` asserts many docs and scripts by literal evidence strings, including `agents-guides-valid=ok`.
- Recent launch evidence uses `lfg-inside-tmux-status=ok`, not the older implicit attach wording.
