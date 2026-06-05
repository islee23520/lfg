# plugins/lfg

This package is the local adapter-installer setup surface for `lazycodex-ai`.

It helps `grok-build` use the `lazycodex` Codex adapter installed under `~/.grok`. `lfg` is not a plugin and should not be framed as one.

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| CLI command surface | `bin/lfg.ts` | Supports only `setup`, `doctor`, and `dry-setup`. |
| Package manifest | `package.json` | Bin and package metadata. |
| Skill copy | `skills/lazycodex/SKILL.md` | User-facing lazycodex installer guidance. |

## CONVENTIONS

- Keep the package small and centered on `lazycodex-ai`.
- Use `npx lazycodex-ai install` as the single installer command.
- Keep `lfg setup` as the human-facing interactive installer.
- Keep CLI JSON output stable because tests and package-executor smoke checks consume it.
- Prefer explicit install plans over hidden side effects.
- Only mutate through an explicit `setup --run` or confirmed interactive `setup`.
- Keep package descriptions neutral: adapter installer, not plugin/runtime ownership.

## ANTI-PATTERNS

- Calling this package a plugin or runtime.
- Adding unrelated runtime or workflow features.
- Mutating `~/.grok` outside an explicit `setup` command surface.
- Printing API keys in JSON output, logs, or summaries.
- Duplicating installer metadata across files without updating tests.

## COMMANDS

```sh
npm test
npm run self-test
npm run build
npm exec --workspace lfg -- lfg --json dry-setup
plugins/lfg/bin/lfg --json setup
plugins/lfg/bin/lfg --json setup --run
plugins/lfg/bin/lfg --json dry-setup
plugins/lfg/bin/lfg --json doctor
```
