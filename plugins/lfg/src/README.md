# LFG source layout

This directory defines the lfg-native Grok Build plugin boundaries. The runtime implementation is intentionally dependency-free under `src/runtime-ts/index.ts`; `bin/` entrypoints should stay thin gateways.

The migration target is not a mechanical file split. OMO's original TypeScript domain logic must be preserved as TypeScript modules with the same conceptual boundaries: orchestration policy stays separate from transport adapters, state machines stay separate from CLI parsing, and generated/plugin metadata stays separate from executable runtime behavior.

Real Grok/xAI API adapters should reference the official xAI SDK docs, but SDK imports must remain optional. Dependency-free smoke paths and bin entrypoints must still run with only the Bun/TypeScript runtime.

- `hooks/` owns hook behavior and prompt/state injection.
- `core/` owns dependency-free OMO policy modules that runtime, MCP, and plugin adapters can delegate to without importing adapter code.
- `plugin/` owns plugin manifest/runtime composition boundaries.
- `tools/` owns callable tool surfaces and validation.
- `mcp/` owns MCP server definitions and protocol adapters.
- `features/` owns workflow modules such as ultragoal, team, ultrawork, and boulder state.
- `agents/` owns the first-class LFG OMO agents, support-agent metadata, and `builtin-agents` policy layer; historical custom names are not bundled as active team-spec members.

Durable run state belongs under the project `.lfg/` directory by default, matching the lfg runtime convention. Explicit `GROK_PLUGIN_DATA` still overrides this for tests and installed-plugin scenarios.
