# xAI / Grok Reference — SSOT for Grok Build Related Specs

**Source of Truth**: [https://docs.x.ai/overview](https://docs.x.ai/overview), the official xAI developer documentation, the Grok Build skills/plugins/marketplaces guide, and the official Python SDK repository [xai-org/xai-sdk-python](https://github.com/xai-org/xai-sdk-python).

**Last checked**: 2026-05 (during active OMO parity work on `feature/lfg-agent-orchestration-omo-parity`).

This document exists so the LFG team has a single, reliable place to reference the current capabilities of the xAI platform and Grok models when making decisions about:

- The Grok Spawn Adapter (`plugins/lfg/src/runtime/cli.py`)
- OMO agent orchestration (Sisyphus, Prometheus, Hephaestus, Atlas, etc.)
- Native Grok sub-agent spawning vs. local fallbacks
- Tool calling, reasoning traces, and stateful interactions

## Official Entry Point

- Primary overview: [https://docs.x.ai/overview](https://docs.x.ai/overview)
- Skills, plugins, marketplaces, hooks, subagents, and compatibility: [https://docs.x.ai/build/features/skills-plugins-marketplaces](https://docs.x.ai/build/features/skills-plugins-marketplaces)
- Responses API (preferred): Generate text, multi-turn chat, function calling, stateful interactions
- Python SDK reference: [https://github.com/xai-org/xai-sdk-python](https://github.com/xai-org/xai-sdk-python)
- Voice, Image (Imagine), and Video APIs also exist but are secondary for agent orchestration work

## Python SDK Reference for Plugin Work

LFG plugin code should use `xai-org/xai-sdk-python` as the reference implementation for real Grok/xAI calls. The dependency-free smoke runtime must not hard-import that SDK: `plugins/lfg/src/runtime/cli.py`, `plugins/lfg/bin/lfg.py`, `plugins/lfg/bin/lfg-mcp.py`, hooks, and local smoke gates stay stdlib-only. Any real SDK adapter belongs behind an optional module boundary under `plugins/lfg/src/` and must degrade to deterministic local envelopes when the SDK or credentials are absent.

This keeps two contracts separate:

- **Platform contract**: xAI docs + Python SDK define how real Grok calls, Responses API usage, tool calling, and future stateful handoffs should be implemented.
- **Smoke/runtime contract**: local CLI, MCP, hooks, and state schema remain executable without installing SDK packages or using real provider credentials.

## Grok Plugin Compatibility Reference

The official Grok Build guide says Grok discovers skills from project/user `.grok/skills`, enabled plugin `skills/`, and configured skill paths; plugins from project/user `.grok/plugins`, marketplace installs, configured plugin paths, and `--plugin-dir`; hooks from user/project/plugin hook roots; and marketplace sources from `~/.grok/config.toml` or known marketplaces. It also states that Grok is fully compatible with Claude Code with zero configuration, automatically reading Claude Code marketplaces, plugins, skills, MCPs, agents, hooks, and instruction files alongside `.grok/`, and that Grok reads the `AGENTS.md` instruction-file family.

For LFG this means the Claude/Agents-compatible layout should be treated as a first-class compatibility surface. Grok-specific JSON files may remain as stable marketplace aliases, but they should not invent unsupported JSON reference semantics. Keep shared manifest and marketplace fields materially aligned and verify that alignment in smoke tests.

## Key Capabilities Relevant to LFG / OMO Parity

### 1. Responses API (Current Recommended Interface)

- Preferred way to interact with Grok models (`grok-4.3` and family).
- **Stateful conversations** using `previous_response_id` — allows continuing a thread without resending full history.
- Supports `store: true/false` for server-side message persistence (30-day retention by default).
- Strong support for **reasoning models** via `include: ["reasoning.encrypted_content"]`.
- OpenAI-compatible client shape (`base_url="https://api.x.ai/v1"`).

This is the closest thing we currently have to clean agent-to-agent handoff (Sisyphus → Prometheus → Hephaestus, etc.).

### 2. Function Calling + Built-in Tools

- Full function calling support (custom tools defined by the caller).
- Built-in agentic tools that run on xAI servers:
  - `web_search`
  - `x_search`
- Can be mixed with custom tools.
- Parallel tool calls supported by default.

### 3. Structured Outputs & Tool Schemas

- JSON Schema for tool parameters.
- Pydantic support in the official SDKs.
- Good for enforcing contracts between agents.

### 4. Models

First-class OMO agents in LFG default to Grok Build host execution with varying reasoning levels. Grok is the native host/gate, and real Grok/xAI API work should reference the official xAI Python SDK above. Approved optional providers (`openai`, `codex`, `copilot`, `zai`) may provide metadata or bounded execution lanes when explicitly configured, but Grok remains the **mandatory Oracle product gate** for every completion, Boulder advancement, and release. No OpenAI/GPT, Gemini, Z.ai, or other non-Grok consultation may replace the xAI/Grok Oracle review contract. `oracleReview.required=true` with `gate: "xai/grok"` is enforced in all advancement envelopes.

See the agent definitions in `plugins/lfg/src/agents/*.json`, the registry loader in `plugins/lfg/src/runtime/cli.py`, the optional adapter boundary under `plugins/lfg/src/`, and the xAI Python SDK reference for future real Grok calls.

Provider setup in LFG is metadata-only: commands record env var names, provider ids, and model hints, but never store API keys, OAuth codes, refresh tokens, CLI auth files, or keychain material.

## Relevance to LFG Grok Spawn Adapter

The current implementation in `spawn_agent()` (and `resolve_omo_model_profile()`) returns a canonical provider-neutral envelope with `mode: "fallback"` and `status: "completed"` (or `blocked` / `failed` for graph and error cases). In fallback mode, `status: "completed"` means the **local contract envelope completed**, not that a real child agent executed. Runtime envelopes expose this distinction under `execution.completionMeaning`, `execution.actualChildExecution`, and `execution.nativeGrokSpawnVerified` because:

- The public Responses API gives us excellent **tool-calling + stateful** agents.
- It does **not** (yet) provide a first-class primitive for **named, persistent sub-agents** with separate identities inside the Grok Build host (the thing real OMO and our target architecture require).

Until Grok Build exposes a native `spawn_subagent(agent_id, ...)` or equivalent inside the plugin runtime, we treat the Responses API + `previous_response_id` + encrypted reasoning as the **strongest available fallback** for Grok-native behavior.

## Usage in This Project

- When modifying the spawn adapter, team runtime, or any agent delegation logic, cross-check this reference.
- When adding real Grok API execution to a plugin module, cross-check `xai-org/xai-sdk-python` and keep SDK imports optional.
- When evaluating "is this truly Grok-native?", use the current state of the Responses API + reasoning features as the measuring stick.
- The `grok_build_omo_*` MCP tools and `lfg spawn <agent>` paths should eventually be able to leverage Responses API primitives for better handoffs.

## Anti-Patterns

- Do not assume the public xAI API gives us "free" named sub-agent spawning (it doesn't — that is a Grok Build host concern).
- Do not weaken the requirement that Grok Oracle review gates every completion, even when execution uses approved non-Grok providers.
- Do not treat the Responses API as a complete replacement for the OMO agent hierarchy — it is a powerful substrate, not the full orchestration system.
- Do not treat `oracleReview.mode: "local-smoke"` / `reviewKind: "static-local-schema"` as a real Grok Oracle judgment. It proves the envelope carries the required gate contract only.

## Related Internal Documents

- [docs/ARCHITECTURE.md](/docs/ARCHITECTURE.md) — especially the "Current Runtime Implementation — How LFG Works with OMO" section and the Grok Spawn Adapter status.
- [docs/agent-system/omo-runtime-implementation-plan.md](/docs/agent-system/omo-runtime-implementation-plan.md)
- `plugins/lfg/src/runtime/cli.py` (spawn adapter, `resolve_omo_model_profile`, Responses API fallback paths)
- `plugins/lfg/bin/lfg-mcp.py` (MCP exposure of OMO tools)

**This document (`docs/reference.md`) is the canonical external reference.** When the xAI/Grok Build platform adds new primitives (especially around native sub-agent spawning), update this file first, then propagate the implications into ARCHITECTURE.md and the spawn adapter.

## DAD-Inspired Internal Supervision Broker Plan

LFG uses a small internal supervision broker inspired by DAD-style delegation control, but it is **not** an OMO agent, not a user-facing role, and not an alternate policy authority. Its API is recorded as `internal-non-agent` inside spawn/result envelopes only.

The broker sits behind the existing orchestration APIs:

- `spawn_agent()` for single OMO delegation.
- `spawn_wave()` for ordered child-delegation envelopes.
- `TeamRuntime` / `team_create()` for team state and member-policy checks.
- `run_dependency_graph()` for deterministic dependency readiness.

For each decision it records the selected lane, model profile, evidence class, and policy decision reason. It may deny execution when an unsupported provider is requested or when a caller attempts uncontrolled recursive spawning beyond the broker lease. These denials preserve OMO policy rather than bypassing it: hard-reject agents remain hard-rejected as team members, Grok Oracle review remains mandatory, and native Grok sub-agent spawning remains manual-gated until the platform exposes a first-class primitive.

---

**Maintainers**: Update this file whenever the official docs at https://docs.x.ai/ change in ways that affect agent orchestration, spawning, reasoning traces, or tool use. Treat it as living SSOT, not static notes.
