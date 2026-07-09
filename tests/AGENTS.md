# tests

Repo-level `tests/` is **policy only** — no `*.test.ts` here. Active tests live under `src/cli`, `src/core`, and `src/grok` (skills tree excluded from `npm test`).

## WHERE TO LOOK

- `src/cli/**`: CLI JSON/contract, setup, publish, doc-contract tests.
- `src/core/**`: host-neutral cores + `core-boundary.test.ts`.
- `src/grok/**`: install/hooks/MCP/doctor acceptance and unit tests.
- `src/cli/test/test-process.ts`: spawn harness for `dist/lfg.js`.
- `src/cli/self-test.ts` / `dist/self-test.js`: smoke (`npm run self-test`).

## SCOPE

- Verify setup-plan and setup-run for the Grok-first installer.
- Keep command output centered on explicit `setup --run` under `~/.grok`.
- Do not add broad runtime/workflow tests under this empty root folder.
- Package/manifest wording is part of the contract when tests assert it.

## COMMANDS

```sh
npm test
npm run self-test
```

## ANTI-PATTERNS

- Weakening CLI JSON assertions to fit unrelated behavior.
- Reintroducing deleted broad-runtime fixtures without restoring the corresponding product surface.
- Adding hidden filesystem mutation outside the explicit `setup` run.
