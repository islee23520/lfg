# ADR: LFG TypeScript Runtime Cutover

**Status**: Accepted
**Date**: 2026-05-21
**Decision makers**: lfg team
**Context**: M14 — TypeScript Runtime Cutover

## Summary

Replace the entire legacy runtime in `plugins/lfg/` with TypeScript, using `omo-standalone` (TypeScript/Bun monorepo) as a git submodule reference. This ADR freezes the technical decisions before implementation begins.

## Decision 1: Submodule Location

**Chosen**: `plugins/lfg/vendor/omo-standalone/`

**Rationale**: The plugin payload must remain self-contained for Grok marketplace installation. The Grok plugin loader copies `source.path = "plugins/lfg"` as the plugin root. If the submodule were at the repo root, the installed plugin would miss it. Placing it inside `plugins/lfg/` ensures marketplace installs include the full submodule tree.

**Alternatives considered**:
- Repo root (`omo-standalone/`): Would require a vendoring/copy step into the plugin tree for marketplace installs. Adds CI complexity and risk of stale copies.
- Separate npm dependency: Would require publishing omo-standalone packages to a registry. Premature for an internal monorepo.

## Decision 2: Runtime Host Strategy

**Chosen**: Bun for development, build, and test. Compiled JS (Bun build output) for shipped runtime.

**Rationale**: Grok Build hosts may not have Bun installed. Compiled JS entrypoints ensure broad Node.js compatibility. Bun is used for:
- `bun install` — workspace dependency management
- `bun test` — running test suites
- `bun build` — compiling TypeScript to JS for shipping
- The compiled JS entrypoints (`dist/`) are what `bin/lfg`, `bin/ulw`, and `bin/lfg-mcp` actually execute

**Build output**: `plugins/lfg/dist/` — compiled JS artifacts that the shell wrappers invoke via `node` or `bun`.

**Alternatives considered**:
- Require Bun on host: Fragile; Grok hosts have Node.js but not necessarily Bun.
- Pure Node.js toolchain: Loses Bun's workspace management and fast test runner. Acceptable for shipped artifacts but not for DX.

## Decision 3: Compatibility Surface Policy

**Chosen**: First TS cut preserves the FULL current CLI/MCP/evidence surface. Surface reduction happens in a separate cleanup phase AFTER the TS migration is green.

**Rationale**: The smoke test suite asserts a very broad compatibility surface. Changing the public surface AND migrating languages simultaneously creates too much risk. Preserve everything first, simplify later.

**In scope for first TS cut**:
- All CLI commands that the current smoke suite asserts
- All MCP tool names (canonical short names + legacy `grok_build_*` aliases)
- All exact evidence strings (`*=ok`)
- All `.lfg/` state layout conventions
- All agent JSON definitions and Grok-discoverable agent wrappers

**Out of scope for first TS cut** (deferred to cleanup phase):
- Removing legacy compatibility commands
- Simplifying the CLI surface
- Renaming or restructuring MCP tools
- Changing evidence string formats

## Decision 4: Temporary Dual-Run Policy

**Chosen**: Legacy and TypeScript runtimes coexist during the migration. The legacy runtime is only removed in the final cutover commit after the TS self-test and smoke matrix are fully green.

**Rules**:
1. Every intermediate commit should have at least one working runtime (legacy or TypeScript).
2. The TypeScript runtime is built incrementally, slice by slice, with matching Bun tests.
3. Legacy runtime files are not modified during the migration (except for compatibility fixes).
4. Legacy runtime removal happens in a single atomic commit after all TS surfaces are verified.

## Decision 5: Smoke Policy Reinterpretation

**Chosen**: "Dependency-free smoke" is reinterpreted to "system Node.js or Bun + compiled JS, no network/credential/provider dependency."

**Preserved**: The exact evidence strings (`*=ok`) remain the contract. The logical checks remain the same. Only the runtime language changes.

**Gate class updates**:
- **Dependency-free unit/smoke tests**: Run with temporary state, no external services. Uses `bun test` or compiled JS.
- **Repo-native integration tests**: Same semantics, different runner (`bun test`).
- **Environment/manual gates**: Unchanged. Still require tmux, real Grok host, etc.

## Migration Phases

| Wave | Tasks | Description |
|------|-------|-------------|
| 0 | T01 | Freeze cutover contract (this ADR) |
| 1 | T02 | Add omo-standalone submodule + Bun workspace scaffold |
| 2 | T03 | Build Bun parity test harness + shared smoke fixtures |
| 3 | T04 | Build TS runtime foundation + omo-standalone adapters |
| 4 | T05, T06, T07 (parallel) | Port CLI observation, orchestration, and workflow surfaces |
| 5 | T08, T09 (parallel) | Port hooks/wrappers and MCP server |
| 6 | T10, T11 (parallel) | Replace self-test/smoke and update docs/CI |
| 7 | T12 | Final cutover and legacy runtime removal |
| 8 | T13 | Final review and manual Grok gates |

## Success Criteria

1. `plugins/lfg/` remains a valid Grok marketplace plugin with identity `islee23520/lfg`.
2. `omo-standalone` is a pinned git submodule under `plugins/lfg/vendor/omo-standalone/`.
3. `.lfg/` layout and state semantics remain durable and doctor-visible.
4. The TS runtime preserves the existing smoke evidence strings and manual gate classifications.
5. MCP remains stdio JSON-RPC and alias-compatible.
6. No legacy runtime dependency remains for runtime, MCP, hooks, self-test, or smoke execution.
7. Post-cutover review and manual Grok gates pass before release.

## Consequences

- **Positive**: Full OMO parity using production TypeScript packages. Shared code with oh-my-openagent ecosystem. Better type safety. Faster iteration with Bun.
- **Negative**: Migration period with dual runtimes. Grok marketplace plugin size increases (submodule). Requires Node.js or Bun on the host for plugin execution.
- **Neutral**: Smoke tests change language but preserve semantics. Evidence strings remain the same.
