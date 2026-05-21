# Test rules

This repository treats tests as product contracts. A test that is flaky, order-dependent, or only passes under special local conditions is failing until the contract is clarified or the gate is reclassified.

## Gate classes

### Dependency-free unit/smoke tests

Dependency-free unit/smoke tests run with temporary state and no real external services, provider credentials, Grok host sessions, or tmux lifecycle requirements. The active TypeScript matrix runs through Bun (`bun test plugins/lfg/src/runtime-ts plugins/lfg/src/mcp-ts plugins/lfg/src/hooks-ts plugins/lfg/src/smoke-ts plugins/lfg/test-utils`) and `bun plugins/lfg/bin/self-test.ts`. After the TypeScript cutover (M14), "dependency-free" means "system Node.js or Bun + compiled JS, no network/credential/provider dependency." See [docs/ts-cutover-adr.md](./ts-cutover-adr.md) for the full policy.

### Repo-native integration tests

Repo-native integration tests may use repository binaries, subprocesses, the filesystem, local CLI commands, and deterministic fake fixtures. They must still be deterministic: no hidden ordering requirements, no sleeps as pass crutches, and no retry loops that mask product behavior.

### Environment/manual gates

Environment/manual gates cover behavior that depends on tmux, the real Grok plugin host, installed `lfg` symlinks, provider availability, marketplace state, or remote GitHub Actions state. `bun plugins/lfg/bin/self-test.ts` includes the bounded local tmux lifecycle gate; `grok-install-smoke.py` was removed in TS cutover, manual Grok gate pending.

## Rules

| Rule ID | Rule | Enforcement hook |
| --- | --- | --- |
| TR-001 | Every new or changed test must be classified as dependency-free unit/smoke, repo-native integration, or environment/manual gate. | Bun smoke tests and reviewers enforce classification on changed tests. |
| TR-002 | Dependency-free unit/smoke tests must use temp state and avoid external binaries, provider credentials, real Grok sessions, and real tmux sessions. | `bun test plugins/lfg/src/runtime-ts plugins/lfg/src/mcp-ts plugins/lfg/src/hooks-ts plugins/lfg/src/smoke-ts plugins/lfg/test-utils` and `bun plugins/lfg/bin/self-test.ts`. |
| TR-003 | Repo-native integration tests may use local subprocesses, filesystem state, CLI binaries, and fake servers, but must be deterministic. | `bun test plugins/lfg/src/runtime-ts plugins/lfg/src/mcp-ts plugins/lfg/src/hooks-ts plugins/lfg/src/smoke-ts plugins/lfg/test-utils` and focused runtime command tests. |
| TR-004 | Environment/manual gates must distinguish missing environment from product failure. | `bun plugins/lfg/bin/self-test.ts` and manual Grok/tmux verification. |
| TR-005 | Exact JSON, tool-call, MCP, and CLI assertions are valid behavior-contract tests. Do not weaken them under the prompt-text rule. | Existing MCP/CLI assertions in the Bun runtime and MCP tests. |
| TR-006 | Prompt tests should assert behavioral invariants, not incidental prose, except where identity, safety wording, or exact command output is itself the product contract. | Review of prompt-facing tests plus existing identity/safety smoke coverage. |
| TR-007 | New tests must not add `load_grok_build_module()` or equivalent global module monkey-patching without scoped approval. Existing uses are grandfathered debt. | Reviewer check and this enforced test-rules contract. |
| TR-008 | No sleeps, retries, special ordering, or isolation flags may be used as pass crutches. Lifecycle waits must subscribe before trigger and use explicit bounded timeouts. | Reviewer check, focused lifecycle tests, and release-readiness gates. |

## Required gates

Run the narrowest gate that proves the changed surface, then widen before release:

```sh
bun test plugins/lfg/src/runtime-ts plugins/lfg/src/mcp-ts plugins/lfg/src/hooks-ts plugins/lfg/src/smoke-ts plugins/lfg/test-utils
bun plugins/lfg/bin/self-test.ts
plugins/lfg/bin/lfg --json doctor
```

When Grok, tmux, marketplace, installed symlink, or provider behavior changes, also run the matching focused environment/manual gate documented in `docs/SMOKE.md` and `docs/RELEASE_CHECKLIST.md`.

The Bun test matrix and TS self-test are the active local gates for the TS runtime.
