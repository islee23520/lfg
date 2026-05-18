# LFG source layout

This directory mirrors the oh-my-openagent responsibility boundaries for LFG. The current runtime remains intentionally dependency-free under `bin/`, while new work should land in the matching area before being wired into the runtime.

- `hooks/` owns hook behavior and prompt/state injection.
- `plugin/` owns plugin manifest/runtime composition boundaries.
- `tools/` owns callable tool surfaces and validation.
- `mcp/` owns MCP server definitions and protocol adapters.
- `features/` owns workflow modules such as ultragoal, team, ultrawork, and boulder state.
- `agents/` owns Lina, GoNow, IZ, and other agent definitions.

Durable run state belongs under the project `.lfg/` directory by default, matching OmO's `.omo` workspace convention. Explicit `GROK_PLUGIN_DATA` still overrides this for tests and installed-plugin scenarios.
