# xAI / Grok Reference — SSOT for Grok Build Related Specs

**Source of Truth**: [https://docs.x.ai/overview](https://docs.x.ai/overview) and the official xAI developer documentation.

**Last checked**: 2026-05 (during active OMO parity work on `feature/lfg-agent-orchestration-omo-parity`).

This document exists so the LFG team has a single, reliable place to reference the current capabilities of the xAI platform and Grok models when making decisions about:

- The Grok Spawn Adapter (`plugins/lfg/bin/lfg.py`)
- OMO agent orchestration (Sisyphus, Prometheus, Hephaestus, Atlas, etc.)
- Native Grok sub-agent spawning vs. local fallbacks
- Tool calling, reasoning traces, and stateful interactions

## Official Entry Point

- Primary overview: [https://docs.x.ai/overview](https://docs.x.ai/overview)
- Responses API (preferred): Generate text, multi-turn chat, function calling, stateful interactions
- Voice, Image (Imagine), and Video APIs also exist but are secondary for agent orchestration work

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

First-class OMO agents in LFG default to Grok models (`xai/grok-4.3` with varying reasoning levels), except Hephaestus, which follows the OMO deep-specialist policy and requires an approved GPT-style profile. Approved optional providers (`codex`, `copilot`, `zai`) may execute bounded lanes. `zai` is modeled as a Z.ai/Zhipu OpenAI-compatible HTTP adapter using the Coding Plan base URL by default, not as a required native CLI. Grok (xAI/Grok) remains the **mandatory Oracle product gate** for every completion, Boulder advancement, and release. No OpenAI/GPT, Gemini, or other non-Grok consultation may replace the xAI/Grok Oracle review contract. `oracleReview.required=true` with `gate: "xai/grok"` is enforced in all advancement envelopes.

See the agent definitions in `plugins/lfg/src/agents/*.json`, the registry loader in `lfg.py`, and `call_zai()` for the smoke-safe Z.ai/Zhipu adapter contract.

Provider setup in LFG is metadata-only: commands record env var names, provider ids, and model hints, but never store API keys, OAuth codes, refresh tokens, CLI auth files, or keychain material.

## Relevance to LFG Grok Spawn Adapter

The current implementation in `spawn_agent()` (and `resolve_omo_model_profile()`) returns a canonical provider-neutral envelope with `mode: "fallback"` and `status: "completed"` (or `blocked` / `failed` for graph and error cases). In fallback mode, `status: "completed"` means the **local contract envelope completed**, not that a real child agent executed. Runtime envelopes expose this distinction under `execution.completionMeaning`, `execution.actualChildExecution`, and `execution.nativeGrokSpawnVerified` because:

- The public Responses API gives us excellent **tool-calling + stateful** agents.
- It does **not** (yet) provide a first-class primitive for **named, persistent sub-agents** with separate identities inside the Grok Build host (the thing real OMO and our target architecture require).

Until Grok Build exposes a native `spawn_subagent(agent_id, ...)` or equivalent inside the plugin runtime, we treat the Responses API + `previous_response_id` + encrypted reasoning as the **strongest available fallback** for Grok-native behavior.

## Usage in This Project

- When modifying the spawn adapter, team runtime, or any agent delegation logic, cross-check this reference.
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
- `plugins/lfg/bin/lfg.py` (spawn adapter, `resolve_omo_model_profile`, Responses API fallback paths)
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
