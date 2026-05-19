# M1 Grok Sub-Agent Spawning Evidence Plan

## Purpose

Define the evidence required before `lfg` relies on Grok Build native sub-agent spawning as the primary delegation path for OMO parity.

## Current Local Credential Observation

Local xAI status was checked with the available xAI tool:

```json
{
  "success": true,
  "credential_source": "xai-oauth",
  "base_url": "https://api.x.ai/v1",
  "oauth_file_present": true
}
```

This proves local xAI credentials are present. It does **not** by itself prove Grok Build native sub-agent spawning support.

## Required Evidence

### Official/Upstream Evidence

Pass criteria:

- Official xAI/Grok Build SDK or product docs identify sub-agent spawning or equivalent orchestration primitives.
- API shape is stable enough to map OMO `task()` and `call_omo_agent` semantics.
- Docs distinguish ordinary chat/tool calls from actual sub-agent spawning.

Fail criteria:

- Only generic model invocation exists.
- No stable API or product behavior can be cited.
- Behavior is available only as informal UI behavior with no automatable contract.

### Local Manual Evidence

Pass criteria:

- A local Grok Build session can spawn at least two named sub-agents for a single parent task.
- The parent can run them in parallel or record independent outputs.
- The parent can synthesize outputs into one result.
- Evidence is recorded as command output, transcript, or documented manual gate.

Suggested manual gate:

```sh
# To be replaced by the real Grok Build command/API once confirmed.
grok build spawn-subagents --task "return distinct one-line findings" --agents researcher,critic --dry-run
```

Until a real command exists, this is a placeholder gate and must not be marked passing.

## OMO to Grok Mapping

| OMO Concept | Grok Build Target | Fallback |
| --- | --- | --- |
| `task(subagent_type=...)` | Spawn named Grok sub-agent from registry | Deterministic local JSON envelope |
| `task(category=...)` | Resolve category to Sisyphus-Junior Grok profile | Local category resolver |
| `call_omo_agent` | Spawn specific OMO-family Grok agent | Local prompt-rendered no-op response |
| Background task | Parallel spawn wave | Sequential deterministic fallback in smoke |
| Lead synthesis | Parent Grok agent synthesis | Local concatenated synthesis with status fields |

## Spawn Adapter Contract

The runtime adapter should expose these operations:

```text
spawn(agent, task)
spawn_wave(agent_tasks[])
run_dependency_graph(plan)
synthesize(outputs[])
resume(run_id)
```

Result envelope:

```json
{
  "ok": true,
  "mode": "native-grok|fallback",
  "agent": "sisyphus-junior",
  "status": "completed|blocked|failed",
  "evidence": [],
  "touchedFiles": [],
  "blockers": [],
  "nextTasks": []
}
```

## Dependency-Free Smoke Fallback

Smoke tests must not require real Grok sessions or provider credentials.

Fallback behavior:

- Resolve agent registry deterministically.
- Render task prompt and model profile.
- Return a JSON envelope with `mode=fallback`.
- Never claim real execution.
- Keep stdout JSON-compatible for MCP tools.

## Implementation Implications

- M3/M4 registry work can proceed with fallback-only tests.
- M5 native spawn adapter cannot be marked complete until official/local evidence exists.
- Release docs must separate dependency-free smoke gates from real Grok manual gates.
