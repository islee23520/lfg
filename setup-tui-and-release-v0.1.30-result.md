# Setup TUI and v0.1.30 release-prep result

Overall: **FAIL — release actions pending and the repository-wide verification gate is not green.**

## Implementation

Status: **PASS**

- Setup TUI prerequisite copy names Codex as the required implementation prerequisite and no longer displays a LazyCodex facade line.
- Model selection copy uses neutral automatic-routing language instead of “best available” or “maximum” marketing language.
- Optional global CLI installation packs the current local package into a temporary tarball, installs that exact tarball globally, and removes the temporary tarball afterward. It does not request the registry `@latest` package.
- Confirmed TUI setup passes `force: true` to the Grok installer so the local plugin payload is refreshed instead of preserving a stamped older tree.

## Verification evidence

- PASS: red/green targeted tests for local tarball install, Codex-only prerequisite copy, and forced TUI refresh.
- PASS: `npx vitest run $(rg --files src/cli/setup | rg 'lfg-setup-tui.*\.test\.ts$') src/cli/setup/lfg-global-install.test.ts` — 9 files, 34 tests.
- PASS: `npx tsc --noEmit --pretty false`.
- PASS: `npm run build`.
- PASS: `npm run assert-pack` inside `npm run verify` — packed `islee23520-lfg-0.1.30.tgz` successfully.
- PASS: `npm run assert-omo-parity` — upstream 4.16.3, 25 managed skills, 3 roots.
- PASS: `npm run assert-skills-smoke` — 37 skills.
- PASS: manual local pack smoke confirmed the tarball contains `package/bin/lfg.js`, `package/dist/lfg.js`, and `package/package.json`.
- NOT RUN: the programming skill's standalone no-excuse checker could not resolve its own `typescript` dependency from the external skill directory. Repository `tsc --noEmit` passed.
- FAIL: repository-wide `npm run verify` reached `npm test` and reported multiple failures in the existing dirty worktree, including model-config single-writer, reasoning propagation, difficulty-tier roles, adapter install, refresh auth, uninstall, feature inventory, skill contract, and subagent routing tests. The test process then stopped producing output and was interrupted after the failures were recorded. These failures are outside the setup-TUI files changed here.

## Release actions

Status: **PENDING FOR ROOT**

- No commit, push, npm publish, GitHub release, or tag was performed.
- Root should resolve or classify the repository-wide test failures, rerun `npm run verify` to completion, then perform the requested release workflow.
