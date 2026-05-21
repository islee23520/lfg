# OMO Runtime Implementation Wave Plan

This is the execution-ready, test-first implementation spec for `ROADMAP.md` M3-M13. It does not implement runtime code. Each slice must land tests before runtime changes, preserve dependency-free smoke behavior, and keep real Grok or tmux requirements behind explicit environment/manual gates.

## Ground Rules

- Write the listed tests first and verify they fail for the missing behavior before implementing the slice.
- Keep every first-class agent on a Grok model profile; no Codex, Claude, Gemini, or Hermes primary model mappings are allowed for the OMO target runtime.
- Preserve deterministic local fallback behavior for smoke tests; real Grok spawning is a separate manual gate until the Grok Build API is proven locally.
- Do not weaken exact CLI, MCP, JSON, state-schema, or evidence-string assertions.
- Advance to the next slice only after the dependency-free smoke gate for the current slice passes.

## Wave Dependencies

```text
Slice 1 Agent Registry Contracts
  -> Slice 2 Grok Model Mapping
  -> Slice 3 Spawn Adapter
  -> Slice 4 Category Routing and Sisyphus-Junior
  -> Slice 5 Boulder State
  -> Slice 6 Team Mode
  -> Slice 7 Hyperplan
  -> Slice 8 Prometheus and Atlas
  -> Slice 9 Hephaestus and Ultrawork
  -> Slice 10 MCP, CLI, Skills, and Hooks
  -> Slice 11 Release QA and Documentation Lock
```

Slices 5-9 may be implemented in parallel only after Slice 3 exposes the shared spawn result envelope and Slice 4 exposes category decisions. Slice 10 waits for all runtime semantics it exposes. Slice 11 is the final lock step.

## Slice 1 - Agent Registry Contracts

Roadmap source: M3.

Objective: freeze the runtime contract for the six required OMO agent families before adding implementation.

Target files:

- `tests/smoke/test_grok_build_runtime.py`
- `plugins/lfg/bin/lfg.py`
- `plugins/lfg/bin/lfg-mcp.py`
- `plugins/lfg/src/agents/harness.toml`
- `plugins/lfg/src/agents/registry.py`
- `plugins/lfg/src/agents/__init__.py`

Tests to add or update:

- Dependency-free smoke: assert `lfg --json agents list` returns `sisyphus`, `sisyphus-junior`, `prometheus`, `hephaestus`, `atlas`, and `builtin-agents`.
- Dependency-free smoke: assert every registry row includes stable `id`, `family`, `role`, `model_profile`, `reasoning_level`, `prompt_source`, `tools`, `blocked_tools`, and `enabled` fields.
- Dependency-free smoke: assert disabled agents and explicit overrides produce exact JSON errors instead of silent fallback.
- MCP smoke: assert the MCP tool list exposes the registry surface without writing diagnostics to stdout or stderr.

Manual QA command:

```sh
plugins/lfg/bin/lfg --json agents list
```

Dependencies:

- `ROADMAP.md` M3 names are the canonical minimum registry set.
- Existing smoke matrix must remain dependency-free and use temporary state only.

Exit criteria:

- The registry contract fails before implementation, then passes with deterministic local data.
- No first-class OMO agent is missing from CLI or MCP discovery.

## Slice 2 - Multi-Provider Model Mapping + Grok Oracle Review

Roadmap source: M3-M4.

Objective: make approved multi-provider model resolution a tested registry invariant while preserving mandatory Grok Oracle review.

Target files:

- `tests/smoke/test_grok_build_runtime.py`
- `plugins/lfg/bin/lfg.py`
- `plugins/lfg/src/agents/harness.toml`
- historical custom-agent references and migration notes
- `plugins/lfg/src/agents/registry.py`
- `plugins/lfg/src/agents/models.py`

Tests to add or update:

- Dependency-free smoke: assert every first-class agent defaults to a Grok/xAI model profile.
- Dependency-free smoke: assert category-specific reasoning levels map to approved profiles and allowed overrides include `codex`, `copilot`, and `zai`.
- Dependency-free smoke: assert user overrides may select only approved providers and reject unsupported model providers.
- Repo-native integration: add `python3 -m unittest tests.smoke.test_grok_build_runtime -v` coverage for model profile serialization changes.

Manual QA command:

```sh
plugins/lfg/bin/lfg --json agents inspect sisyphus
```

Dependencies:

- Slice 1 registry fields must exist.
- Open decision in `ROADMAP.md` about one model profile versus category-specific reasoning levels must preserve mandatory Grok Oracle review either way.

Exit criteria:

- Unsupported model providers are impossible through CLI, MCP, category defaults, or override input; approved non-Grok providers still require Grok Oracle review.

## Slice 3 - Grok Spawn Adapter

Roadmap source: M5.

Objective: implement a runtime adapter that can spawn one agent, spawn a parallel wave, execute a dependency graph, and synthesize outputs through a deterministic smoke fallback.

Target files:

- `tests/smoke/test_grok_build_runtime.py`
- `plugins/lfg/bin/lfg.py`
- `plugins/lfg/bin/lfg-mcp.py`
- `plugins/lfg/src/agents/spawn.py`
- `plugins/lfg/src/agents/results.py`
- `python3 plugins/lfg/bin/grok-install-smoke.py`
- `docs/SMOKE.md`

Tests to add or update:

- Dependency-free smoke: assert local fallback `spawn` returns a structured envelope with `status`, `agent_id`, `model_profile`, `evidence`, `touched_files`, `blockers`, `children`, and `oracleReview`.
- Dependency-free smoke: assert parallel wave output preserves task IDs and deterministic ordering of synthesized results.
- Dependency-free smoke: assert dependency graph execution refuses blocked tasks until dependencies complete.
- Environment/manual gate: document and later verify real Grok native spawn evidence separately from fallback smoke.

Manual QA command:

```sh
plugins/lfg/bin/lfg --json spawn sisyphus-junior --category quick --task "noop spawn smoke"
```

Dependencies:

- Slice 1 registry lookup.
- Slice 2 Grok model profile resolution.
- Confirmed local fallback semantics for environments without native Grok spawn.

Exit criteria:

- The adapter can prove OMO-style spawn semantics without real credentials and has a named manual gate for real Grok spawn evidence.

## Slice 4 - Category Routing and Sisyphus-Junior

Roadmap source: M6.

Objective: port category routing and ensure category tasks spawn Sisyphus-Junior with bounded delegation rules.

Target files:

- `tests/smoke/test_grok_build_runtime.py`
- `plugins/lfg/bin/lfg.py`
- `plugins/lfg/src/agents/categories.py`
- `plugins/lfg/src/agents/router.py`
- `plugins/lfg/src/agents/spawn.py`
- `plugins/lfg/skills/worker/SKILL.md`
- `plugins/lfg/skills/team/SKILL.md`

Tests to add or update:

- Dependency-free smoke: assert supported categories are `quick`, `deep`, `ultrabrain`, `artistry`, `visual-engineering`, `writing`, `unspecified-low`, and `unspecified-high`.
- Dependency-free smoke: assert category tasks route to `sisyphus-junior` unless a higher-level orchestrator is explicitly required.
- Dependency-free smoke: assert Sisyphus-Junior cannot recursively spawn another uncontrolled Sisyphus-Junior wave.
- Dependency-free smoke: assert category decisions include reason, selected model profile, blocked tools, and verification gate.

Manual QA command:

```sh
plugins/lfg/bin/lfg --json route --category ultrabrain --task "design the spawn adapter"
```

Dependencies:

- Slice 3 spawn adapter envelope.
- Slice 2 category-to-Grok model mapping.

Exit criteria:

- Routing is inspectable, deterministic in smoke tests, and blocks recursive uncontrolled delegation.

## Slice 5 - Boulder State

Roadmap source: M7.

Objective: port Boulder, continuation, mailbox, tasklist, notepad, and schema validation roots under `.lfg/` without breaking existing state migration contracts.

Target files:

- `tests/smoke/test_grok_build_runtime.py`
- `plugins/lfg/bin/lfg.py`
- `plugins/lfg/src/features/boulder.py`
- `plugins/lfg/src/features/state_schema.py`
- `plugins/lfg/hooks/plugin smoke checks lfg-goal-harness.py`
- `lfg --json doctor state schema check`
- `docs/SMOKE.md`

Tests to add or update:

- Dependency-free smoke: assert a temp `.lfg/boulder/` root stores current goal, attempts, evidence, blockers, continuation notes, and schema version.
- Dependency-free smoke: assert `doctor` validates `.lfg/boulder/`, `.lfg/notepads/`, `.lfg/mailbox/`, `.lfg/tasklists/`, and `.lfg/teams/` roots.
- Dependency-free smoke: assert Boulder advancement is rejected without evidence from a spawn result envelope.
- Focused script: update `lfg --json doctor state schema check` to include Boulder schema evidence while preserving `state-schema-versioning=ok`.

Manual QA command:

```sh
lfg --json doctor state schema check
```

Dependencies:

- Slice 3 result envelope for evidence.
- Existing state-schema compatibility must remain intact until the explicit M7 migration changes it.

Exit criteria:

- Boulder state is schema-versioned, doctor-visible, and cannot advance on unverifiable claims.

## Slice 6 - Team Mode

Roadmap source: M8.

Objective: port member kinds, eligibility, mailbox delivery, task lifecycle, shutdown protocol, tmux observability, Grok spawning, and smoke-safe provider behavior.

Target files:

- `tests/smoke/test_grok_build_runtime.py`
- `plugins/lfg/bin/lfg.py`
- `plugins/lfg/bin/lfg-mcp.py`
- `plugins/lfg/src/features/team.py`
- `plugins/lfg/skills/team/SKILL.md`
- `python3 plugins/lfg/bin/self-test.py team tmux lifecycle section`
- `python3 plugins/lfg/bin/self-test.py team preflight section`
- `python3 plugins/lfg/bin/self-test.py team provider section`

Tests to add or update:

- Dependency-free smoke: assert team specs support `kind="category"` and `kind="subagent_type"` members with eligibility validation.
- Dependency-free smoke: assert task lifecycle transitions are `pending`, `claimed`, `in_progress`, `completed`, and `deleted` with owner checks.
- Dependency-free smoke: assert noop provider can create, status, resume, and shutdown a team without real provider credentials.
- Environment/manual gate: keep tmux lifecycle in focused scripts and distinguish missing tmux from product failure.

Manual QA command:

```sh
python3 plugins/lfg/bin/self-test.py team tmux lifecycle section
```

Dependencies:

- Slice 3 spawn adapter for Grok-backed members.
- Slice 5 `.lfg/teams/`, mailbox, and tasklist state roots.

Exit criteria:

- Team Mode preserves smoke-safe noop behavior while exposing the same lifecycle through CLI, slash, and MCP.

## Slice 7 - Hyperplan

Roadmap source: M9.

Objective: port adversarial planning with hostile critics, revision rounds, final lead synthesis, task graph creation, and `.lfg/hyperplan/` artifacts.

Target files:

- `tests/smoke/test_grok_build_runtime.py`
- `plugins/lfg/bin/lfg.py`
- `plugins/lfg/src/features/hyperplan.py`
- `plugins/lfg/src/features/team.py`
- `plugins/lfg/skills/team/SKILL.md`
- `docs/agent-system/hyperplan-teams.md`

Tests to add or update:

- Dependency-free smoke: assert Hyperplan requires `unspecified-low`, `unspecified-high`, `ultrabrain`, and `artistry`, with optional `deep`.
- Dependency-free smoke: assert critique rounds record independent analysis, cross-attack, defend/refine, and lead synthesis artifacts.
- Dependency-free smoke: assert final plan artifacts are written under temp `.lfg/hyperplan/` with schema version and task graph.
- Dependency-free smoke: assert weak or missing critic compositions produce exact validation errors.

Manual QA command:

```sh
plugins/lfg/bin/lfg --json hyperplan "design Grok spawn adapter acceptance gates"
```

Dependencies:

- Slice 6 Team Mode eligibility and task lifecycle.
- Slice 4 category routing for required critic categories.
- Slice 5 `.lfg/hyperplan/` state root.

Exit criteria:

- Hyperplan produces a durable adversarial plan artifact, not just a prompt transcript.

## Slice 8 - Prometheus and Atlas

Roadmap source: M10.

Objective: port Prometheus interview-mode planning and Atlas checkbox execution with dependency waves and incomplete-checkbox prevention.

Target files:

- `tests/smoke/test_grok_build_runtime.py`
- `plugins/lfg/bin/lfg.py`
- `plugins/lfg/src/features/prometheus.py`
- `plugins/lfg/src/features/atlas.py`
- `plugins/lfg/skills/plan/SKILL.md`
- `plugins/lfg/skills/deep-interview/SKILL.md`

Tests to add or update:

- Dependency-free smoke: assert Prometheus writes plans under temp `.lfg/plans/` with assumptions, pass/fail criteria, dependencies, and manual gates.
- Dependency-free smoke: assert Atlas reads a plan, dispatches only unblocked checkbox waves, and updates checkboxes only after verified completion.
- Dependency-free smoke: assert incomplete checkbox prevention blocks final completion and reports the remaining unchecked items.
- Dependency-free smoke: assert Atlas records spawn evidence back into Boulder before advancing the plan.

Manual QA command:

```sh
plugins/lfg/bin/lfg --json prometheus plan "ship OMO registry"
```

Dependencies:

- Slice 3 spawn adapter.
- Slice 5 `.lfg/plans/` and Boulder evidence state.
- Slice 4 category routing for Atlas-dispatched Sisyphus-Junior work.

Exit criteria:

- Planning and execution are separate: Prometheus cannot silently implement, and Atlas cannot mark unchecked work complete without evidence.

## Slice 9 - Hephaestus and Ultrawork

Roadmap source: M11.

Objective: port autonomous deep work and Ultrawork loops with explicit stop conditions, blocker escalation, and evidence before Boulder advancement.

Target files:

- `tests/smoke/test_grok_build_runtime.py`
- `plugins/lfg/bin/lfg.py`
- `plugins/lfg/bin/ulw`
- `plugins/lfg/src/features/hephaestus.py`
- `plugins/lfg/src/features/ultrawork.py`
- `plugins/lfg/skills/ultrawork/SKILL.md`

Tests to add or update:

- Dependency-free smoke: assert Hephaestus receives a goal and acceptance criteria, not step-by-step recipes.
- Dependency-free smoke: assert Ultrawork loop stops only on verified completion, explicit blocker escalation, user cancellation, or bounded failure protocol.
- Dependency-free smoke: assert loop iterations persist attempts and evidence in Boulder.
- Dependency-free smoke: assert `ulw` wrapper reports OMO Ultrawork identity and routes through the same runtime semantics as `lfg ultrawork`.

Manual QA command:

```sh
plugins/lfg/bin/ulw --json status
```

Dependencies:

- Slice 5 Boulder state.
- Slice 3 spawn adapter.
- Slice 4 category routing for deep and ultrabrain modes.

Exit criteria:

- Ultrawork is a verified execution loop with stop conditions, not an infinite prompt preamble.

## Slice 10 - MCP, CLI, Skills, and Hooks

Roadmap source: M12.

Objective: expose OMO registry, spawn, team, Boulder, Hyperplan, Prometheus, Atlas, Hephaestus, and Ultrawork semantics consistently through CLI, MCP, slash skills, hooks, and wrappers.

Target files:

- `tests/smoke/test_grok_build_runtime.py`
- `plugins/lfg/bin/lfg.py`
- `plugins/lfg/bin/lfg-mcp.py`
- `plugins/lfg/bin/lfg`
- `plugins/lfg/bin/ulw`
- `plugins/lfg/skills/*/SKILL.md`
- `plugins/lfg/hooks/hooks.json`
- `plugins/lfg/hooks/plugin smoke checks lfg-audit-hook.sh`
- `plugins/lfg/hooks/plugin smoke checks lfg-goal-harness.py`
- `python3 plugins/lfg/bin/self-test.py MCP stdio section`
- `python3 plugins/lfg/bin/grok-install-smoke.py`

Tests to add or update:

- Dependency-free smoke: assert CLI JSON and MCP JSON-RPC expose equivalent OMO actions and error shapes.
- Dependency-free smoke: assert skills call OMO runtime paths instead of legacy workflow identities.
- Dependency-free smoke: assert hooks inject OMO execution discipline without writing non-JSON protocol output to MCP stdout.
- Focused script: preserve `mcp-stdio-isolation=ok` and installed Grok skill count evidence unless those contracts are intentionally migrated with matching docs.

Manual QA command:

```sh
python3 plugins/lfg/bin/self-test.py MCP stdio section
```

Dependencies:

- Slices 1-9 runtime semantics must exist before their surfaces are documented as active.
- Existing skill coverage matrix and release evidence strings remain contracts until migrated with tests.

Exit criteria:

- A user can reach the same OMO operation through CLI, MCP, and slash surfaces with consistent JSON and evidence behavior.

## Slice 11 - Release QA and Documentation Lock

Roadmap source: M13.

Objective: lock tests, smoke docs, release checklist, and real Grok manual gates around the completed OMO runtime.

Target files:

- `docs/SMOKE.md`
- `docs/RELEASE_CHECKLIST.md`
- `docs/TEST_RULES.md`
- `docs/ARCHITECTURE.md`
- `docs/agent-system/*.md`
- `python3 plugins/lfg/bin/self-test.py`
- `python3 plugins/lfg/bin/self-test.py`
- `python3 plugins/lfg/bin/self-test.py plus marketplace remote smoke`
- `.github/workflows/smoke.yml`

Tests to add or update:

- Dependency-free smoke: require all new OMO runtime smoke cases from Slices 1-10.
- Repo-native integration: run `python3 -m unittest tests.smoke.test_grok_build_runtime -v` if Python runtime, MCP, model profile, or state surfaces changed.
- Environment/manual gates: run focused Grok, tmux, installed symlink, hook, and MCP gates that match changed runtime surfaces.
- Release-readiness scripts: update expected evidence strings only when tests and docs change together.

Manual QA command:

```sh
python3 plugins/lfg/bin/self-test.py
```

Dependencies:

- Slices 1-10 complete.
- Any open decisions from `ROADMAP.md` that affect release behavior must be resolved or explicitly documented as blockers.

Exit criteria:

- `README.md`, `ROADMAP.md`, architecture docs, smoke docs, release docs, plugin metadata, skills, hooks, CLI, MCP, and tests describe one coherent OMO-for-Grok product.

## Final Verification Ladder

Run these gates in order after each implementation wave reaches its exit criteria:

```sh
python3 -m unittest tests.smoke.test_grok_build_runtime -v
python3 plugins/lfg/bin/self-test.py
python3 plugins/lfg/bin/self-test.py
```

When Python runtime, MCP, model, or state code changes, also run:

```sh
python3 -m unittest tests.smoke.test_grok_build_runtime -v
```

When real Grok, tmux, marketplace, installed symlink, or provider behavior changes, also run the focused environment/manual gate listed in `docs/SMOKE.md` for that surface before claiming release readiness.
