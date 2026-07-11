# scripts

## OVERVIEW

Root build bundler and the publish/pack/auth readiness gates. These scripts are the release contract — invoked from `package.json` scripts, not run ad hoc.

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Bundle dist | `build.mjs` | esbuild; 8 CLI entry points → `dist/*.js`, plus 2 staged Grok hook runtime bundles. |
| Stage install payload | `build.mjs` | Copies `fixture/`, `assets/`, `flavour/`, `skills/`; generates MCP runtime CLIs. |
| Pack tarball guard | `assert-npm-pack-bin.mjs` | `npm run assert-pack`; required paths + bin target. |
| OMO parity guard | `assert-omo-parity.mjs` | `npm run assert-omo-parity`; validates generated OMO skill payloads, docs, inventory, and build cache guard. |
| Publish readiness | `pre-publish-check.mjs` | `npm run pre-publish-check`; exits 2 if not ready. |
| Publish auth | `assert-npm-publish-auth.mjs` | `npm run assert-publish-auth`. |
| Version gap record | `record-publish-gap.mjs` | `npm run record-publish-gap`. |
| Fast-tier smoke | `verify-fast-tier-tmux.sh` | tmux-driven live check. |

## CONVENTIONS

- `build.mjs` acquires `dist/.build.lock` (120s timeout) because concurrent builds corrupt `fixture` staging; do not bypass it.
- `fixture` is staged via temp dir + atomic `rename` with retry on `ENOTEMPTY`/`EBUSY`/`EEXIST`. `assert-npm-pack-bin.mjs` fails the pack if any `fixture.build-*` path leaks into the tarball.
- The `lfg-setup-tui` bundle is the only entry that externalizes `@clack/prompts` + `picocolors` (declared in root `package.json` `dependencies`); all other entries are fully bundled.
- Gate scripts exit non-zero (`2`) on not-ready so CI/`prepublishOnly` fails loudly. `pre-publish-check.mjs` composes publish-gap + publish-auth + registry-bin contract.
- `LFG_NPM_WHOAMI=""` forces unauthenticated; any other non-empty value overrides the npm whoami (test hook).
- The `verify` pipeline orders: `assert-pack` → `assert-omo-parity` → `test` → `typecheck` → `self-test`.

## ANTI-PATTERNS

- Adding a runtime/dependency not already in root `package.json` (the project is npm/esbuild only — no Bun).
- Letting the build emit `fixture.build-*` temp dirs into `dist/`.
- Weakening `assert-npm-pack-bin.mjs` required-path or bin-target assertions to make pack pass.
- Weakening `assert-omo-parity.mjs` required-skill, manifest, inventory, docs, or `includeCache: false` assertions to make a drifted OMO payload pass.
- Making gate scripts exit `0` on not-ready.
