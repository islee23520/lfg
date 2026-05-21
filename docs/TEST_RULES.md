# Test rules

This repository treats tests as product contracts. A test that is flaky, order-dependent, or only passes under special local conditions is failing until the contract is clarified or the gate is reclassified.

## Gate classes

### Dependency-free unit/smoke tests

Dependency-free unit/smoke tests run with temporary state and no real external services, provider credentials, Grok host sessions, or tmux lifecycle requirements. The Python-first plugin runtime matrix lives in `tests/smoke/test_grok_build_runtime.py`.

### Repo-native integration tests

Repo-native integration tests may use repository binaries, subprocesses, the filesystem, local CLI commands, and deterministic fake fixtures. They must still be deterministic: no hidden ordering requirements, no sleeps as pass crutches, and no retry loops that mask product behavior.

### Environment/manual gates

Environment/manual gates cover behavior that depends on tmux, the real Grok plugin host, installed `lfg` symlinks, provider availability, marketplace state, or remote GitHub Actions state. `python3 plugins/lfg/bin/self-test.py` includes the bounded local tmux lifecycle gate.

## Rules

| Rule ID | Rule | Enforcement hook |
| --- | --- | --- |
| TR-001 | Every new or changed test must be classified as dependency-free unit/smoke, repo-native integration, or environment/manual gate. | `tests/smoke/test_grok_build_runtime.py` enforces this document's required markers; reviewers enforce classification on changed tests. |
| TR-002 | Dependency-free unit/smoke tests must use temp state and avoid external binaries, provider credentials, real Grok sessions, and real tmux sessions. | `tests/smoke/test_grok_build_runtime.py` and `python3 plugins/lfg/bin/self-test.py`. |
| TR-003 | Repo-native integration tests may use local subprocesses, filesystem state, CLI binaries, and fake servers, but must be deterministic. | `python3 -m unittest tests.smoke.test_grok_build_runtime -v`. |
| TR-004 | Environment/manual gates must distinguish missing environment from product failure. | `python3 plugins/lfg/bin/self-test.py`, `python3 plugins/lfg/bin/grok-install-smoke.py`, and manual Grok/tmux verification. |
| TR-005 | Exact JSON, tool-call, MCP, and CLI assertions are valid behavior-contract tests. Do not weaken them under the prompt-text rule. | Existing MCP/CLI assertions in `tests/smoke/test_grok_build_runtime.py`. |
| TR-006 | Prompt tests should assert behavioral invariants, not incidental prose, except where identity, safety wording, or exact command output is itself the product contract. | Review of prompt-facing tests plus existing identity/safety smoke coverage. |
| TR-007 | New tests must not add `load_grok_build_module()` or equivalent global module monkey-patching without scoped approval. Existing uses are grandfathered debt. | Reviewer check and this enforced test-rules contract. |
| TR-008 | No sleeps, retries, special ordering, or isolation flags may be used as pass crutches. Lifecycle waits must subscribe before trigger and use explicit bounded timeouts. | Reviewer check, focused lifecycle tests, and release-readiness gates. |

## Required gates

Run the narrowest gate that proves the changed surface, then widen before release:

```sh
python3 -m py_compile plugins/lfg/bin/lfg.py plugins/lfg/bin/lfg-mcp.py plugins/lfg/bin/self-test.py plugins/lfg/bin/grok-install-smoke.py plugins/lfg/src/runtime/cli.py plugins/lfg/src/runtime/constants.py tests/smoke/test_grok_build_runtime.py
python3 -m ruff check .
python3 -m unittest tests.smoke.test_grok_build_runtime -v
python3 plugins/lfg/bin/self-test.py
plugins/lfg/bin/lfg --json doctor
```

When Grok, tmux, marketplace, installed symlink, or provider behavior changes, also run the matching focused environment/manual gate documented in `docs/SMOKE.md` and `docs/RELEASE_CHECKLIST.md`.

Ruff is the Python lint gate for this package. Configure rule changes in `pyproject.toml`; do not add local-only wrapper scripts for linting.
