# tests

Repo-level tests should stay focused on the lazycodex Codex adapter installer.

Current active tests live under `plugins/lfg/bin`.

## WHERE TO LOOK

- `plugins/lfg/bin/lfg.test.ts`: CLI contract tests.
- `plugins/lfg/bin/lfg-mcp.test.ts`: MCP list/dispatch smoke tests.
- `plugins/lfg/bin/self-test.ts`: direct smoke script that emits `check-*=ok`.
- `plugins/lfg/test-utils`: shared helpers when present.

## SCOPE

- Verify CLI, MCP, and setup-plan behavior for installing or locating the `lazycodex` adapter.
- Assert that command output stays centered on `npx lazycodex-ai install`.
- Cover non-mutating status and setup-plan contracts.
- Do not add tests for unrelated runtime or workflow behavior.
- Treat package/manifest wording as part of the installer-helper contract when tests assert it.

## COMMANDS

```sh
bun test plugins/lfg/bin
bun plugins/lfg/bin/self-test.ts
```

## ANTI-PATTERNS

- Weakening CLI or MCP JSON assertions to fit unrelated behavior.
- Reintroducing deleted broad-runtime fixtures without restoring the corresponding product surface.
- Adding hidden filesystem mutation to make install-plan tests pass.
