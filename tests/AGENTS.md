# tests

Repo-level tests should stay focused on the lazycodex adapter installer.

Current active tests live under `plugins/lfg/bin`.

## WHERE TO LOOK

- `plugins/lfg/bin/lfg.test.ts`: CLI contract tests.
- `plugins/lfg/bin/self-test.ts`: direct smoke script that emits `check-*=ok`.

## SCOPE

- Verify setup-plan and setup-run behavior for the lazycodex adapter installer.
- Assert that command output stays centered on `npx lazycodex-ai install`.
- Do not add tests for unrelated runtime or workflow behavior.
- Treat package and manifest wording as part of the installer-helper contract when tests assert it.

## COMMANDS

```sh
npm test
npm run self-test
```

## ANTI-PATTERNS

- Weakening CLI JSON assertions to fit unrelated behavior.
- Reintroducing deleted broad-runtime fixtures without restoring the corresponding product surface.
- Adding hidden filesystem mutation outside the explicit `setup` run.
