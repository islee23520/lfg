# tests/AGENTS.md

## OVERVIEW
Behavior-contract tests for the Python-first Grok plugin runtime. This directory enforces the product surface more than implementation style.

## WHERE TO LOOK
- `smoke/test_grok_build_runtime.py`: 2055-line dependency-free feature matrix for plugin runtime, MCP tools, skills, team mode, docs coverage, and named agents.
- `
## CONVENTIONS
- Follow `docs/TEST_RULES.md` for every new or changed test.
- Dependency-free smoke uses `TemporaryDirectory`, `GROK_PLUGIN_DATA`, and `HOME` overrides.
- Repo-native smoke may use subprocesses, local filesystem state, and deterministic fake fixtures.
- Environment/manual gates belong in `scripts/` with preflight checks, not in dependency-free smoke.
- Exact JSON, MCP, CLI, evidence, and identity assertions are valid product contracts.

## ANTI-PATTERNS
- Do not add new `load_grok_build_module()`-style global monkey-patching without scoped approval. Existing uses are grandfathered debt.
- Do not weaken assertions on exact evidence strings to make prompt-facing tests easier.
- Do not require real Grok, tmux, provider CLIs, or credentials in dependency-free tests.
- Do not use sleeps, retries, special ordering, or isolation flags as pass crutches.

## COMMANDS
```sh
python3 -m unittest tests.smoke.test_grok_build_runtime -v
```

## NOTES
- Tests are treated as product contracts.
- Run the narrowest gate first, then widen according to `docs/TEST_RULES.md`.
