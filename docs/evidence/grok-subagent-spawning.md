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

T28 executable manual gate:

```sh
grok --cwd "/var/folders/6r/g20fxk_s1ds24_h6lm971wt00000gn/T/opencode" \
  --output-format streaming-json \
  --max-turns 30 \
  --no-alt-screen \
  -p "T28 native subagent gate. Do not edit files. If your real subagent/task tool works, spawn two read-only child agents named researcher and critic in parallel. researcher output: one sentence explaining why generic Responses API calls are not native named sub-agent evidence. critic output: one sentence explaining why credentials presence is not native named sub-agent evidence. Then report child IDs, both outputs, and a one-sentence synthesis. If actual child spawn fails or IDs/outputs cannot be collected, output MANUAL_GATE_NOT_RUN with the failing prerequisite. Be concise; do not simulate child outputs."
```

The gate passes only when the captured transcript proves all of the following in one parent Grok session:

- Two named child agents are actually spawned by the host, not simulated in parent prose.
- The parent receives two distinct child identifiers or equivalent host handles.
- The parent collects independent output from both children.
- The parent synthesizes those independent outputs into one result.
- The evidence file records the command/API transcript and the evidence string `grok-native-spawn-manual=ok`.

The gate fails or is skipped when any prerequisite is missing, including a missing Grok CLI, missing authenticated Grok session, unavailable task/sub-agent tool, inability to retrieve child outputs, or transcript that only shows ordinary chat/tool calls. Failed or skipped attempts must record `manual_gate_not_run` evidence and must not create `task-28-real-grok-gate.txt` or mark native spawn as passing.

T28 local status captured on 2026-05-20: `manual_gate_not_run`. A bounded Grok CLI attempt reported `MANUAL_GATE_NOT_RUN` because child outputs could not be collected from the returned identifiers. Native Grok spawn therefore remains manual-gated.

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
  "schemaVersion": 1,
  "operation": "spawn|spawn_wave|run_dependency_graph|synthesize|resume",
  "mode": "native-grok|fallback",
  "agent": "sisyphus-junior",
  "agentId": "sisyphus-junior",
  "status": "completed|blocked|failed",
  "execution": {
    "completionMeaning": "contract-envelope-completed|child-execution-completed",
    "actualChildExecution": false,
    "nativeGrokSpawnVerified": false
  },
  "runId": "run-...",
  "taskId": "task-...",
  "children": [],
  "evidence": [],
  "evidenceClass": "dependency-free-smoke|repo-native-integration|real-grok-manual-gate",
  "modelProfile": {},
  "touchedFiles": [],
  "blockers": [],
  "nextTasks": [],
  "oracleReview": {"required": true, "gate": "xai/grok"},
  "debug": {}
}
```

Provider-specific response bodies must not appear at top level. Raw-adjacent provider material is allowed only under redacted `evidence` or `debug` metadata.

## First-Class Evidence Classes (T4 Normalized)

Per T1 source-of-truth matrix and OMO parity contract, the following three evidence classes are first-class citizens in every spawn, team, and Boulder advancement envelope:

- `dependency-free-smoke`: Verifiable via `python3 -m unittest tests.smoke.test_grok_build_runtime` or `lfg --json` commands with no external credentials or Grok sessions. Used for registry, model policy, and deterministic envelope shape.
- `repo-native-integration`: Verifiable from committed files, CLI output, or focused smoke that exercises local Python paths (e.g., agent registry load, eligibility hard-rejects, provider metadata rules).
- `real-grok-manual-gate`: Requires explicit local Grok Build session or future native `spawn_subagent` primitive. Documented in manual gate procedure below; never auto-claimed.

Every result envelope MUST include `"evidenceClass": "<one-of-three>"` and `"oracleReview": {"required": true, "gate": "xai/grok"}`.

## Dependency-Free Smoke Fallback

Smoke tests must not require real Grok sessions or provider credentials.

Fallback behavior:

- Resolve agent registry deterministically.
- Render task prompt and model profile.
- Return a JSON envelope with `mode=fallback`.
- Mark fallback completion as contract-envelope completion, not real child execution.
- Never claim real execution.
- Keep stdout JSON-compatible for MCP tools.

## Implementation Implications

- M3/M4 registry work can proceed with fallback-only tests.
- M5 native spawn adapter cannot be marked complete until official/local evidence exists.
- Release docs must separate dependency-free smoke gates from real Grok manual gates.
