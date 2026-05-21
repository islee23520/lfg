# tests/AGENTS.md

## OVERVIEW

The `tests/` tree owns behavior-contract coverage for the Python-first LFG runtime. Tests here prove OMO parity claims with deterministic smoke checks, repo-native integration checks, and bounded environment/manual gates.

## WHERE TO LOOK

- `smoke/test_grok_build_runtime.py`: Main runtime contract matrix for CLI, MCP, team flows, docs alignment, and evidence strings.
- `smoke/test_hook_bridge_pytest.py`: Deterministic hook-bridge behavior checks.
- `../docs/TEST_RULES.md`: Gate classification rules and required verification commands.
- `../plugins/lfg/bin/self-test.py`: Local smoke bundle that must emit exact `*=ok` evidence strings, including `agents-guides-valid=ok`.

## CONVENTIONS

- Treat tests as product contracts, not loose examples.
- Classify each changed test as dependency-free smoke, repo-native integration, or environment/manual before extending coverage.
- Keep AGENTS guide assertions, docs assertions, and self-test evidence aligned when changing contract text.
- Prefer deterministic subprocess and temp-state coverage over sleeps, retries, or hidden ordering assumptions.

## ANTI-PATTERNS

- Do not weaken exact CLI, MCP, JSON, or evidence-string assertions just to make tests pass.
- Do not depend on real provider credentials, real Grok sessions, or unbounded tmux state in dependency-free smoke tests.
- Do not add shell-only smoke tests when Python coverage can express the same contract.

## COMMANDS

```sh
python3 -m unittest tests.smoke.test_grok_build_runtime -v
python3 -m pytest tests/smoke/test_hook_bridge_pytest.py -q
python3 plugins/lfg/bin/self-test.py
```

## NOTES

- `tests/AGENTS.md` is part of the Wave 1 AGENTS validity contract and must stay structurally complete.
- When docs or runtime contracts change, update the matching smoke assertions in the same change.
