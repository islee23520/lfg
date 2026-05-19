# Feature: `/autoresearch-goal` professor-critic state

## Goal

Provide an OMX-like autoresearch-goal entrypoint for LFG that records a durable research question, hypotheses, and professor-critic gate evidence.

## User contract

```text
/autoresearch-goal create "What is safest?" --hypotheses "A;B"
/autoresearch-goal critique --verdict pass --critic professor --evidence "sources verified"
/autoresearch-goal show
```

## Runtime contract

- Runtime command: `bin/lfg autoresearch-goal create/critique/show`
- MCP tool: `grok_build_autoresearch_goal`
- State path: `.lfg/runs/autoresearch-goal/*.json`
- Current pointer: `.lfg/state/current-autoresearch-goal.json`
- Gate status: `needs-critique`, `revise`, `blocked`, or `pass`

## Smoke coverage matrix

| Requirement | Test |
| --- | --- |
| autoresearch-goal create/critique/show persists critic gate state | `test_autoresearch_goal_create_critique_show` |
| MCP autoresearch-goal tool records professor-critic progress | `test_mcp_autoresearch_goal_tool` |

Current smoke coverage target: **100% of the matrix above must pass**.

## OMO-inspired extensions (toward research parity)

- **Multi-critic / hyperplan dispatch**: Future support for launching parallel or adversarial critiques using hyperplan team templates (iz + grok + gonow with deep/ultrabrain categories) instead of single `--critic` string; mirrors OMO hyperplan + Momus ruthless reviewer pattern while staying Grok-native via named agents in `plugins/lfg/src/agents/legacy/`.
- **Agent-backed professor & critic roles**: Map `professor` (deep researcher) and `critic` to explicit named agents + categories (e.g. `iz` with `default_category=deep` backed by codex for structural research truth; `grok` consultant with `ultrabrain` for synthesis). Wired through the agent definition system (`docs/agent-system/agent-definitions.md`, `categories.md`) and ULW identity.
- **Goal-driven persistence (Hephaestus style)**: Autoresearch-goal records become linkable sub-artifacts under `ultragoal` boulders (`.lfg/ultragoal/...` + shared ledger); "give a goal, not a recipe" enables Sisyphus-style long-running research with explicit stop conditions and evidence accumulation across sessions.
- **Evidence & notepad carry-over**: Critiques and verdicts automatically contribute to learnings/decisions/verification artifacts (`.lfg/autoresearch-goal/{id}/` or linked ultragoal notepads), enabling wisdom accumulation (OMO boulder + notepads pattern) without heavy infrastructure.
- **Verification & evidence strings**: Existing `test_autoresearch_goal_create_critique_show` (professor critic) + `test_mcp_autoresearch_goal_tool` already cover core. Planned extension gates include `autoresearch-goal-omo-hybrid=ok`, `research-agent-category-dispatch=ok`, and `autoresearch-goal-runtime-omo-notes=ok` (to be asserted in smoke matrix and release-readiness scripts).

**Execution context (ultragoal-driven)**: This feature is now actively driven by the durable ultragoal `omo-autoresearch-goal-execution-20260518` (linked to completed research `omo-autoresearch-goal-20260518`). See `.lfg/ultragoal/omo-autoresearch-goal-execution-20260518/plan.md` and ledger for current stories and checkpoints. The `research` prompt overrides in `src/agents/legacy/{iz,grok,gonow}*.json` (added 2026-05-18) provide the professor / Momus-critic / Hephaestus-executor personas ready for spawn and future `--spec` wiring.

These extensions preserve the current minimalist runtime contract while documenting the evolution path from pure OMX professor-critic to OMX+OMO hybrid, all via existing LFG mechanisms (named agents, hyperplan, .lfg/ state, Grok sub-agents). See `docs/ARCHITECTURE.md` (OMO Research & Durable Workflow Patterns + 7 port recs + item 6) and `docs/agent-system/omo-parity-comparison.md` for the broader context. Active ultragoal: omo-autoresearch-goal-execution-20260518.
