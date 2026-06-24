# tests

Repo-level tests should stay focused on the Grok-first lfg adapter installer.

Current active tests live under `src/cli` and `src/grok`.

## WHERE TO LOOK

- `src/cli/lfg.test.ts`: broad CLI integration contract tests.
- `src/cli/command/*.test.ts`: command routing/help contract tests.
- `src/cli/self-test.ts`: direct smoke script that emits `check-*=ok`.

## SCOPE

- Verify setup-plan and setup-run behavior for the Grok-first lfg adapter installer.
- Assert that command output stays centered on explicit `setup --run` materialization under `~/.grok`.
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
