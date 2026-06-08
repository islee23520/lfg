# plugins/lfg

**omo / lazycodex Grok Build adapter spinoff** — npm setup surface for Grok Build (not Linalab).
Transition: two npx steps today; target: **`runGrokInstall()`** + **ported** LFP capabilities (not LFP package copy).

```sh
npx @islee23520/lfg setup
```

runs (in order):

```sh
npx lazycodex-ai install
npx @islee23520/lfp setup
```

`lfg` is not a plugin and should not be framed as one.

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| CLI command surface | `bin/lfg.ts` | Supports only `setup`. |
| Installer chain | `bin/lfg-installer.ts` | Fail-fast two-step `npx`. |
| Package manifest | `package.json` | Bin and package metadata. |
| Skill copy | `skills/lazycodex/SKILL.md` | User-facing installer guidance. |

## CONVENTIONS

- Keep the package small and centered on the two upstream installers.
- Use `npx lazycodex-ai install` then `npx @islee23520/lfp setup` in that order.
- Ask for the OpenAI-compatible base URL during interactive setup, then fetch
  `/v1/models` and map discovered model ids before install confirmation.
- Keep `lfg setup` as the human-facing interactive installer.
- Keep CLI JSON output stable because tests and package smoke checks consume it.
- Prefer explicit install plans over hidden side effects.
- Only mutate through an explicit `setup --run` or confirmed interactive `setup`.
- Keep package descriptions neutral: setup helper, not plugin/runtime ownership.

## ANTI-PATTERNS

- Calling this package a plugin or runtime.
- Adding unrelated runtime or workflow features.
- Mutating `~/.grok` outside an explicit `setup` command surface.
- Printing API keys in JSON output, logs, or summaries.
- Duplicating installer metadata across files without updating tests.
- Skipping or reordering the LFP step relative to lazycodex-ai.

## COMMANDS

```sh
npm test
npm run self-test
npm run build
node plugins/lfg/dist/lfg.js --json setup
node plugins/lfg/dist/lfg.js --json setup --run
```