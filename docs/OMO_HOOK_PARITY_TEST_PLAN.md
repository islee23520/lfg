# OMO Hook Parity Test Plan and Evidence Contract

**Team:** omo-hook-parity  
**Owner:** qa-verifier  
**Target Evidence:** agent-behavior-hook-parity=ok  
**Related Tasks:** 1 (agent-behavior, completed), 2 (boulder-state), 3 (tiers.py), 5 (mcp-ulw-bridge)  
**Date:** 2026-05-21

## Overview
This document defines the complete test plan, evidence strings, self-test integration, and verification criteria to ensure all OMO hook ports match expected behavior. Hooks must remain fail-open, support per-agent behavioral constraints, and integrate with MCP/ulw paths.

## 1. Mapping of OMO Hooks to LFG Python Modules

| OMO Hook Concept | LFG Implementation | Key Files | Notes |
|------------------|--------------------|-----------|-------|
| Goal / Event Harness | Thin router + modular dispatch | `src/hooks/goal_harness.py`, `hooks/scripts/lfg-goal-harness.py` | Imports from payload, dispatch_gate, injection, state_io, todo_continuation, ralph_loop, stop_continuation_guard, etc. |
| Dispatch Gate / Continuation | Native dispatch + manual gate fallback | `src/hooks/dispatch_gate.py`, `src/runtime/dispatch_gate.py` | `reserve_continuation_dispatch`, checks `native_dispatch_supported` |
| Injection / Prompt Augmentation | Aggressive + compaction protection | `src/hooks/injection.py`, `src/hooks/compaction_protection.py` | `build_aggressive_injection`, `write_injection_artifacts` |
| State / Boulder Persistence | OMO-aligned BoulderState | `src/hooks/state_io.py`, `src/hooks/boulder_persistence.py` | Task 2 aligns to schema_version=2, works: Record<string, BoulderWorkState> |
| Todo Continuation | Checklist enforcer | `src/hooks/todo_continuation.py` | `incomplete_todo_items`, `todo_continuation_reminder` |
| Ralph Loop / Never-Stops | Background continuation | `src/hooks/ralph_loop.py` | `ralph_continuation_reminder` |
| 5-Tier Hook System | Tier registry + composition | `src/hooks/tiers.py` (Task 3 pending), `src/hooks/__init__.py` | HOOK_TIERS, list_hook_tiers, get_tier_for_event; maps to OMO 5-tier safeCreateHook |
| Agent Detection & Constraints | Env + heuristic + per-agent policy | `src/hooks/payload.py` (`detect_current_agent`), `src/agents/*.json`, `src/runtime/constants.py` | Supports Sisyphus, Hephaestus, Prometheus, Atlas, Sisyphus-Junior, builtin-agents |
| Ambiguity / Stop Guards | Heuristic + protection | `src/hooks/ambiguity_gate.py`, `src/hooks/stop_continuation_guard.py` | `compute_heuristic_ambiguity`, fail-open guards |
| Snapshot / Run Discovery | State inspection | `src/hooks/snapshot.py`, `src/hooks/run_discovery.py` | `get_goal_snapshot`, `find_active_runs` |
| Task Helpers / Evidence | Fingerprinting | `src/hooks/task_helpers.py` | `evidence_identity`, `progress_evidence_fingerprint` |

**Per-Agent Behavioral Constraints (from Task 1 completion):**
- **Sisyphus**: Orchestration persistence, Boulder advancement, verification gate.
- **Hephaestus**: Model-family enforcement (GPT-style deep-specialist only), deep-work injection.
- **Prometheus**: Plan-only guards (hard-reject as teammate).
- **Atlas**: Todo-continuation hooks, dependency wave execution.
- **Sisyphus-Junior**: Bounded execution, category routing only.
- **builtin-agents**: Eligibility registry, tool-blocking, model profile resolution.
- General: Tool eligibility, fail-open on hook errors, no secret leakage.

## 2. Required Evidence Strings

All evidence strings must appear literally in self-test.py output and smoke runs.

**Core Hook Parity Evidence:**
- `agent-behavior-hook-parity=ok` (primary target for this team)
- `dispatch-gate=ok`
- `tiers-5tier-mapping=ok` (Task 3)
- `boulder-state-alignment=ok` (Task 2)
- `mcp-ulw-hook-contract=ok` (Task 5)

**Existing / Related Evidence (must continue to pass):**
- `hook-smoke=ok`
- `hook-bridge-pytest=ok`
- `todo-continuation=ok`
- `continuation-gate=ok`
- `state-schema-versioning=ok`
- `state-schema-doctor=ok`
- `manifest-and-file-checks=ok`
- `runtime-smoke-coverage=100%`
- `ruff-check=ok`

**Verification Contract:**
- Every evidence string must be printed exactly once per successful self-test run.
- No pre-existing failures unrelated to this work.
- Hooks must not break host session (fail-open verified in hook_smoke).

## 3. Self-Test.py Integration Points

**Location:** Extend `plugins/lfg/bin/self-test.py`

**New Function (add before main):**
```python
def hook_parity_smoke(tmp: pathlib.Path) -> None:
    env = os.environ.copy()
    env.update({"GROK_PLUGIN_ROOT": str(ROOT), "GROK_PLUGIN_DATA": str(tmp)})

    # Per-agent behavioral tests
    for agent in ["sisyphus", "hephaestus", "prometheus", "atlas", "sisyphus-junior"]:
        env["CURRENT_AGENT"] = agent
        # Run harness simulation or lfg command that triggers hooks
        # e.g., run lfg with goal that exercises dispatch/injection/continuation
        # Assert correct BoulderWorkState, model enforcement, plan guards, etc.

    # Dispatch gate verification
    # ...

    # Tier verification (after Task 3)
    # ...

    print("agent-behavior-hook-parity=ok")
    print("dispatch-gate=ok")
```

**Integration in main():**
- Call `hook_parity_smoke(tmp)` after existing hook_smoke and before runtime_smokes.
- Ensure it runs inside the TemporaryDirectory context.
- Add to the unittest / pytest coverage if new tests are added.

**Self-test command remains:** `python3 plugins/lfg/bin/self-test.py`

## 4. Manual QA Checklist for MCP + ulw Invocation Paths

**Preconditions:** Clean `.lfg/` or temp GROK_PLUGIN_DATA; no real credentials in smoke.

1. **MCP Hook Invocation**
   - Start `python3 plugins/lfg/bin/lfg-mcp.py`
   - Call tools that trigger hooks (e.g., catalog, team, slash, ultrawork)
   - Verify JSON-RPC only on stdout, diagnostics on stderr.
   - Check `GROK_HOOK_EVENT` propagation and dispatch_gate response.

2. **ulw / Ultrawork Hook Paths**
   - Run `plugins/lfg/bin/ulw "test hook parity goal"`
   - Verify IntentGate + agent detection.
   - Check `.lfg/ultrawork/` and Boulder state updates.
   - Confirm stop conditions and continuation reminders.

3. **Per-Agent Scenario Tests**
   - Sisyphus: Full orchestration + Boulder advance.
   - Hephaestus: Reject non-GPT model, enforce deep injection.
   - Prometheus: Reject teammate role, enforce plan-only.
   - Atlas: Execute todo waves, update checkboxes.
   - Sisyphus-Junior: Bounded task, no second orchestrator.
   - Verify eligibility/tool-blocking via builtin-agents.

4. **Fail-Open & Safety**
   - Inject hook errors; confirm session continues.
   - Verify no secret leakage (audit hook test).
   - Check compaction protection and ambiguity gates.

5. **Cross-Checks**
   - Run full `python3 plugins/lfg/bin/self-test.py` and capture all `*=ok` strings.
   - Run `python3 -m unittest tests.smoke.test_grok_build_runtime -v`
   - Run `python3 -m ruff check .`
   - Review `docs/TEST_RULES.md`, `docs/AGENTS.md`, `ROADMAP.md` for contract alignment.
   - Inspect `docs/reference.md` (Grok Build SSOT) if spawn/hook behavior claimed.

6. **Evidence Collection**
   - Screenshot / log all `*=ok` outputs.
   - Document any gaps from mcp-ulw-bridge contract analysis (Task 5).
   - Confirm LFG_LAUNCHER, session IDs, env vars propagate correctly.

**Pass Criteria:** All checklist items green, zero new failures, all target evidence strings present.

## 5. Execution Order & Dependencies

1. Complete Task 3 (tiers.py) and Task 2 (boulder-state) — unblocks full parity.
2. Implement Task 5 contract — informs QA.
3. Run this test plan (qa-verifier).
4. Final verification by qa-verifier: report to lead with evidence bundle.
5. Lead decides shutdown after all tasks complete.

## 6. Observations & Risks

- Hooks are already highly modular and fail-open (good).
- Agent detection relies on env vars + prompt heuristics — ensure robust for all 11 agents.
- Boulder schema alignment (Task 2) is critical for state evidence.
- 5-tier mapping (Task 3) enables future OMO parity claims.
- MCP/ulw bridge (Task 5) may reveal env propagation gaps.

**Next Step for qa-verifier:** After background explore completes and peer tasks advance, execute the plan, add the evidence prints to self-test.py, run verification, and report results.

---
*This plan ensures deterministic, evidence-based verification that LFG hook ports exactly match OMO behavior.*

## 7. Additional Findings from Parallel Code Exploration (bg_459ba71f)

**Core Enforcement Locations (strong foundation):**
- `core/agent_registry.py` + `runtime/constants.py`: `validate_team_member_eligibility()`, `resolve_model_profile()` (Hephaestus GPT-only), `route_task_request()` (Sisyphus-Junior bounded + blockedTools), `spawn_agent()` (structured error envelopes).
- `cli.py`: spawn/route/inspect policy application points.

**Hook Layer Responsibilities:**
- `goal_harness.py`: agent detection → boulder persist → injection → continuation dispatch.
- `injection.py`: agent-specific protocol text (Hephaestus deep/GPT block cheap, Prometheus plan-only, Atlas todo-wave, Sisyphus-Junior bounded, Sisyphus orchestrator).
- Continuation: `todo_continuation.py`, `ralph_loop.py`, `stop_continuation_guard.py` (evidence fingerprinting, bounded reminders).
- State: `boulder_persistence.py`, `state_io.py`, `dispatch_gate.py`.

**Identified Gaps vs OMO (historical note; resolved items should stay green):**
- Historical Lina/Boulder owner mismatch was resolved; current contract is canonical Sisyphus-owned Boulder state.
- `payload.py:detect_current_agent()` uses limited heuristic list + env; sync with full registry from `src/agents/*.json`.
- Atlas: only general todo continuation; missing dedicated dependency-wave stateful hook.
- Model profile mismatch: `constants.py` "xhigh" for deep vs docs "high".
- Native spawn / hook emission still manual-gate + documented limitations (`docs/ARCHITECTURE.md`, `docs/HOOK_EVIDENCE.md`).
- Enforcement split between prompt injection and core; push more hard-guards into runtime for parity.

**Recommended QA Additions:**
- Assert no "Lina" legacy or `last_updated_by = "boulder-state"` drift in hook outputs / boulder JSON during per-agent tests.
- Verify full agent list (sisyphus, hephaestus, prometheus, atlas, sisyphus-junior, builtin-agents + others) in detect_current_agent.
- Cross-check `docs/agent-system/omo-runtime-implementation-plan.md` slices 4/5/8/9/10.
- Confirm evidence strings from exploration: `grok-hook-discovery=ok`, `hook-event-replay=ok`, `grok-headless-session=ok`.

**Update Files for Parity (reference for future edits):**
`goal_harness.py`, `injection.py`, `payload.py`, `state_io.py`, `boulder_persistence.py`, `dispatch_gate.py`, `todo_continuation.py`, `core/agent_registry.py`, `runtime/constants.py`, `runtime/cli.py`, agent JSONs, smoke tests, ARCHITECTURE.md.

These findings are now part of the verification contract.
