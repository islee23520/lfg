# Test rules

This repository treats tests as product contracts. A test that is flaky, order-dependent, or only passes under special local conditions is failing until the contract is clarified or the gate is reclassified.

## Gate classes

### Dependency-free unit/smoke tests

Dependency-free unit/smoke tests run with temporary state and no real external services, provider credentials, Grok host sessions, or tmux lifecycle requirements. They are expected to pass in one normal suite run without isolation flags, retries, or special ordering. The current Python smoke matrix is enforced through `tests/smoke/test_grok_build_runtime.py`, which is run by `plugins/lfg/bin/self-test.sh`.

### Repo-native integration tests

Repo-native integration tests may use repository binaries, subprocesses, the filesystem, local CLI commands, Rust integration tests, and deterministic fake servers. They must still be deterministic: no hidden ordering requirements, no sleeps as pass crutches, and no retry loops that mask product behavior. Rust integration coverage lives under `tests/*.rs` and is run with `cargo test` when the Rust gate is in scope.

### Environment/manual gates

Environment/manual gates cover behavior that depends on tmux, the real Grok plugin host, installed `lfg` symlinks, provider availability, marketplace state, or remote GitHub Actions state. These gates must preflight the environment separately from product failure. The local aggregate gate is `scripts/verify-release-readiness-local.sh`; the full aggregate gate is `scripts/verify-release-readiness-all.sh`.

## Rules

| Rule ID | Rule | Enforcement hook |
| --- | --- | --- |
| TR-001 | Every new or changed test must be classified as dependency-free unit/smoke, repo-native integration, or environment/manual gate. | `tests/smoke/test_grok_build_runtime.py` enforces this document's required markers; reviewers enforce classification on changed tests. |
| TR-002 | Dependency-free unit/smoke tests must use temp state and avoid external binaries, provider credentials, real Grok sessions, and real tmux sessions. | `tests/smoke/test_grok_build_runtime.py` and `plugins/lfg/bin/self-test.sh`. |
| TR-003 | Repo-native integration tests may use local subprocesses, filesystem state, CLI binaries, fake servers, and Rust integration tests, but must be deterministic. | `cargo test`, `tests/smoke/test_grok_build_runtime.py`, and focused verify scripts. |
| TR-004 | Environment/manual gates must distinguish missing environment from product failure. | `scripts/verify-release-readiness-local.sh`, `scripts/verify-release-readiness-all.sh`, and focused Grok/tmux verification scripts. |
| TR-005 | Exact JSON, tool-call, MCP, and CLI assertions are valid behavior-contract tests. Do not weaken them under the prompt-text rule. | Existing MCP/CLI assertions in `tests/smoke/test_grok_build_runtime.py` and Rust integration tests. |
| TR-006 | Prompt tests should assert behavioral invariants, not incidental prose, except where identity, safety wording, or exact command output is itself the product contract. | Review of prompt-facing tests plus existing identity/safety smoke coverage. |
| TR-007 | New tests must not add `load_grok_build_module()` or equivalent global module monkey-patching without scoped approval. Existing uses are grandfathered debt. | Reviewer check and this enforced test-rules contract. |
| TR-008 | No sleeps, retries, special ordering, or isolation flags may be used as pass crutches. Lifecycle waits must subscribe before trigger and use explicit bounded timeouts. | Reviewer check, focused lifecycle tests, and release-readiness gates. |

## Required gates

Run the narrowest gate that proves the changed surface, then widen before release:

```sh
python3 -m unittest tests.smoke.test_grok_build_runtime -v
plugins/lfg/bin/self-test.sh
scripts/verify-release-readiness-local.sh
```

When Rust code or Rust tests change, include:

```sh
cargo test
```

When Grok, tmux, marketplace, installed symlink, or provider behavior changes, also run the matching focused environment/manual gate documented in `docs/SMOKE.md` and `docs/RELEASE_CHECKLIST.md`.
