# LFG source layout

This directory defines the lfg-native Grok Build plugin boundaries. The current runtime remains intentionally dependency-free under `bin/`, while new work should land in the matching area before being wired into the runtime.

- `hooks/` owns hook behavior and prompt/state injection.
- `plugin/` owns plugin manifest/runtime composition boundaries.
- `tools/` owns callable tool surfaces and validation.
- `mcp/` owns MCP server definitions and protocol adapters.
- `features/` owns workflow modules such as ultragoal, team, ultrawork, and boulder state.
- `agents/` owns the canonical 11 OMO agents plus `builtin-agents` policy layer; legacy named agents live under `agents/legacy/`.

Durable run state belongs under the project `.lfg/` directory by default, matching the lfg runtime convention. Explicit `GROK_PLUGIN_DATA` still overrides this for tests and installed-plugin scenarios.
