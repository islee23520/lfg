# plugins/lfg

**omo / lazycodex Grok Build adapter spinoff** — npm setup surface for Grok Build (not Linalab).
Default **`setup --run`** runs **`runGrokInstall()`** (omo tree on `~/.grok`, ported hooks/agents/overrides). No `npx lazycodex-ai install` into `~/.codex`.

```sh
npx @islee23520/lfg setup
```

`lfg` is not a plugin and should not be framed as one.

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| CLI command surface | `bin/` | Supports only `setup`; see `bin/AGENTS.md`. |
| Grok install | `bin/lfg-installer.ts`, `grok-install/` | Single internal grok-install step; see `grok-install/AGENTS.md`. |
| Package manifest | `package.json` | Bin and package metadata. |
| Skill copy | `skills/lazycodex/SKILL.md` | User-facing installer guidance. |

## CONVENTIONS

- Keep the package small and centered on Grok `~/.grok` install (not Codex `npx lazycodex-ai install`).
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
- Reintroducing `npx lazycodex-ai install` as a required default setup step.

## COMMANDS

```sh
npm test
npm run self-test
npm run build
node plugins/lfg/dist/lfg.js --json setup
node plugins/lfg/dist/lfg.js --json setup --run
```