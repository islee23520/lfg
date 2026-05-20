# LFG source layout

This directory defines the lfg-native Grok Build plugin boundaries. The runtime implementation is intentionally dependency-free under `src/runtime/cli.py`; `bin/` entrypoints should stay thin gateways.

The migration target is not a mechanical file split. OMO's original TypeScript domain logic must be preserved as Python modules with the same conceptual boundaries: orchestration policy stays separate from transport adapters, state machines stay separate from CLI parsing, and generated/plugin metadata stays separate from executable runtime behavior.

Real Grok/xAI API adapters should reference the official Python SDK repository, `https://github.com/xai-org/xai-sdk-python`, but SDK imports must remain optional. Dependency-free smoke paths and bin entrypoints must still run with only the Python standard library.

- `hooks/` owns hook behavior and prompt/state injection.
- `plugin/` owns plugin manifest/runtime composition boundaries.
- `tools/` owns callable tool surfaces and validation.
- `mcp/` owns MCP server definitions and protocol adapters.
- `features/` owns workflow modules such as ultragoal, team, ultrawork, and boulder state.
- `agents/` owns the canonical 11 OMO agents plus `builtin-agents` policy layer; legacy named agents live under `agents/legacy/`.

Durable run state belongs under the project `.lfg/` directory by default, matching the lfg runtime convention. Explicit `GROK_PLUGIN_DATA` still overrides this for tests and installed-plugin scenarios.
