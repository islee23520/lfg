# LFG Core Layer

This directory is the dependency-free core layer for OMO parity logic that is
not specific to a CLI, MCP server, hook, or Grok transport adapter.

The intended pattern mirrors the OMO package-layering refactor:

- `core/` owns reusable policy/state logic.
- `runtime/` owns command parsing, `.lfg/` state IO, and fallback execution.
- `mcp/` owns JSON-RPC protocol adaptation and static tool schemas.
- `plugin/` owns plugin composition boundaries.

Runtime modules may delegate here, but core modules must not import runtime CLI
code or provider SDKs.

Current extracted slices:

- `agent-registry.ts` — OMO agent discovery, team eligibility, category routing,
  and model-resolution policy.
- `spawn-policy.ts` — canonical spawn envelopes, manual-gate policy, internal
  supervision-broker records, and envelope validation.
- `atlas-boulder.ts` — Atlas task dependency progress, bounded delegation
  records, and Boulder migration/build helpers.
