# OMO Feature Traceability Matrix

This is the active traceability artifact for LFG's OMO parity work. It replaces the historical `oh-my-openagent-doc-diff.md` snapshot as the feature-status reference used by release review.

Status meanings:

- `wired`: dependency-free runtime behavior is implemented and covered by smoke/self-test.
- `manual-gated`: runtime has a deterministic fallback or envelope, but real Grok/host evidence is still required.
- `manual-gated-ok`: real Grok/host evidence has passed for the named manual gate, while dependency-free smoke paths still use deterministic fallback behavior.
- `transition`: active compatibility surface exists, but the path is not yet the default OMO-native loop.

| OMO feature area | Current LFG status | Evidence / verification path |
| --- | --- | --- |
| Agent registry: Sisyphus, Sisyphus-Junior, Prometheus, Hephaestus, Atlas, builtin-agents plus support agents | wired | `python3 plugins/lfg/bin/self-test.py`; `tests/smoke/test_grok_build_runtime.py::RuntimeSmoke.test_omo_agent_registry_cli`; `lfg --json agents list`; Grok-discoverable plugin wrappers in `plugins/lfg/agents/*.md` |
| Category routing to Sisyphus-Junior | wired | `RuntimeSmoke.test_category_route_mutual_exclusion_and_bounds`; `RuntimeSmoke.test_mcp_exposes_runtime_and_team_tools`; `lfg --json route --category quick --task "..."`; `lfg --json slash "/route --category quick ..."`; MCP `route` |
| Model/provider policy and Hephaestus deep-specialist guard | wired | `RuntimeSmoke.test_omo_model_family_matching_policy`; `RuntimeSmoke.test_t17_hephaestus_model_mismatch_blocks_and_ulw_requires_evidence` |
| Grok Oracle review envelope requirement | wired for fallback envelopes | `RuntimeSmoke.test_spawn_envelope_requires_grok_oracle_review`; native Grok child execution remains separately manual-gated |
| Spawn adapter envelope, spawn wave, dependency graph, synthesis, resume | wired as deterministic fallback | `RuntimeSmoke.test_spawn_adapter_t8_operations`; `RuntimeSmoke.test_canonical_spawn_envelope_fixture_and_wave_order`; `docs/ARCHITECTURE.md` current-state section |
| Native Grok named child spawning | manual-gated-ok | `docs/SMOKE.md` real Grok gate; latest local evidence is `docs/evidence/t28-grok-manual-gate-status.md` with `grok-native-spawn-manual=ok` for `lfg:explore` + `lfg:oracle`; dependency-free runtime paths still use fallback envelopes |
| Boulder state, continuation, evidence gate, stop guard | wired | `state-schema-doctor=ok`, `continuation-gate=ok`, `todo-continuation=ok`, `RuntimeSmoke.test_t12_completion_rejects_prose_and_accepts_artifact_evidence` |
| Atlas plan/checklist/dependency-wave execution | wired for CLI/runtime and hook reminder | `RuntimeSmoke.test_t16_atlas_resumes_with_wisdom_and_rejects_evidence_free_checkbox`; `HarnessRuntimeSmoke.test_atlas_dependency_wave_reminder_tracks_ready_and_blocked_tasks` |
| Prometheus interview-mode planning for ambiguous work | wired | `RuntimeSmoke.test_plan_create_without_steps_enters_prometheus_interview_mode`; `RuntimeSmoke.test_t25_prometheus_atlas_worker_end_to_end_and_resume_smoke`; `lfg --json plan create "vague objective"` returns `status=awaiting_answers`, clarification questions, and no executable checklist until answered |
| Hephaestus autonomous deep worker surface | wired with model guard and evidence discipline | `RuntimeSmoke.test_t17_hephaestus_model_mismatch_blocks_and_ulw_requires_evidence`; `lfg --json hephaestus goal ...` |
| Team Mode mailbox/tasklist/lifecycle/shutdown | wired with tmux/local provider lanes | `RuntimeSmoke.test_t13_team_lifecycle_mailbox_tasklist_and_shutdown`; `team-tmux-lifecycle=ok`; real Grok child lanes remain manual-gated |
| Hyperplan hostile critics and lead synthesis | wired deterministic fallback | `RuntimeSmoke.test_t14_hyperplan_noop_artifact_and_bounded_roster`; `RuntimeSmoke.test_t14_hyperplan_missing_synthesis_blocks_completion` |
| MCP canonical short-name surface | wired | `RuntimeSmoke.test_mcp_exposes_runtime_tools_for_skill_surface` now asserts `tools/list` exactly matches `plugins/lfg/src/mcp/tools.json` and exposes no `grok_build_*` names; route parity uses canonical MCP `route` |
| Grok install/discovery smoke | wired environment gate | `python3 plugins/lfg/bin/grok-install-smoke.py`; evidence strings use discovered counts, e.g. `grok-install-smoke=ok skills=27 key_skills_present` and `grok-agent-discovery=ok agents=10 key_agents_present` |
| Legacy/transition slash surfaces | transition | `ROADMAP.md` Active Skill Coverage Matrix; these remain compatibility surfaces unless each is promoted to an OMO-native default path |
| Default closed loop: Sisyphus owns Boulder and automatically delegates normal Ultrawork/loop starts through spawn waves | wired for deterministic fallback | `RuntimeSmoke.test_t17_hephaestus_model_mismatch_blocks_and_ulw_requires_evidence`; `lfg --json ulw "..."` returns `defaultSpawnWave` and `defaultSpawnWavePlan`; `ultragoal`, `team create`, and `ralph` remain separate explicit transition surfaces |

Release language may cite the passing native Grok child-spawn manual evidence above, but must not claim dependency-free native execution or full automatic closed-loop parity until the remaining `manual-gated`/`transition` rows are upgraded with recorded evidence.
