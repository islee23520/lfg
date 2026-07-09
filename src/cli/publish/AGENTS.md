# src/cli/publish

## OVERVIEW

Pack, registry, auth, readiness, and workflow helpers that implement the npm publish contract for the root package.

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Pack layout / bin | `layout/`, `bin/`, `pack/` | Tarball required paths; bin target `lfg`. |
| Registry / version | `registry/` | View/compare published versions. |
| Auth | `auth/npm-publish-auth.ts` | `LFG_NPM_WHOAMI` test hook; unauthenticated → not ready. |
| Readiness composite | `readiness/` | Gap + auth + registry composition. |
| Workflow / docs | `workflow/` | Includes `npm-publish-doc.test.ts` for `docs/npm-publish.md`. |
| GitHub helpers | `github/` | Release-adjacent helpers only if present. |

## CONVENTIONS

- Root `package.json` is the only publish target; no nested package publishes.
- Gate scripts called from `scripts/*.mjs` must stay deterministic and script-compatible.
- Not-ready outcomes exit `2` (not silent `0`).
- Contract tests static-read script text and required phrases; prefer tightening assertions.

## ANTI-PATTERNS

- Weakening pack required-path or bin-target assertions to make pack pass.
- Adding runtime deps outside root `package.json`.
- Network/live registry in non-integration tests.
- Publishing from `src/` or a nested manifest.
