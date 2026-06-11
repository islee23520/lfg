# PROJECT KNOWLEDGE BASE

**Generated:** 2026-06-11
**Commit:** d7ae555
**Branch:** main

## OVERVIEW

`lfg` is the npm entry for an **omo / lazycodex Grok Build adapter**. The default install path is Grok-first: `setup --run` materializes the internal grok-install payload under `~/.grok/installed-plugins/lfg` and does not require `npx lazycodex-ai install` into `~/.codex`.

## STRUCTURE

```text
./
├── plugins/lfg/      # publishable adapter package subtree; own scoped instructions
│   ├── bin/          # CLI, JSON contracts, package/publish helpers, dense tests
│   ├── grok-install/ # internal Grok installer, hooks, agent sync, fixtures
│   └── skills/       # user-facing skill copy shipped with the package
├── scripts/          # root build and publish/readiness helpers
├── docs/             # adapter ownership/parity/config/publish docs
├── plans/            # planning history; do not treat as product surface
└── tests/            # narrow repo-level test scope; own scoped instructions
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Change CLI output or routing | `plugins/lfg/bin/lfg.ts` | Command set stays `setup`. |
| Change setup plan JSON | `plugins/lfg/bin/lfg.ts`, `plugins/lfg/bin/setup-json-contract.ts` | Tests assert exact fields. |
| Change installer orchestration | `plugins/lfg/bin/lfg-installer.ts`, `plugins/lfg/grok-install/run-grok-install.ts` | Grok `~/.grok` path only by default. |
| Change Grok install filesystem behavior | `plugins/lfg/grok-install/` | Explicit `setup --run` / confirmed interactive setup only. |
| Change model discovery or aliases | `plugins/lfg/bin/lfg-models.ts`, `plugins/lfg/grok-install/*config*` | Keep JSON output and config writes stable. |
| Change hooks or trust behavior | `plugins/lfg/grok-install/*hook*`, `plugins/lfg/grok-install/assets/` | Bridge wrapping must stay idempotent. |
| Change agent TOML sync or overrides | `plugins/lfg/grok-install/*agent*`, `plugins/lfg/grok-install/flavour-pack-assets/` | Grok-first defaults; user overrides win. |
| Change publish/package shape | `package.json`, `plugins/lfg/package.json`, `scripts/`, `plugins/lfg/bin/*publish*`, `plugins/lfg/bin/*pack*` | Publish from repo root. |
| Change user-facing skill copy | `plugins/lfg/skills/` | Keep Grok-first `lfg setup` wording aligned. |
| Change docs | `docs/` | Docs are tested by `*-doc.test.ts` files under `plugins/lfg/bin`. |

## CODE MAP

| Surface | Location | Role |
|---------|----------|------|
| `lfg setup` | `plugins/lfg/bin/lfg.ts` | Human interactive installer. |
| `lfg --json setup` | `plugins/lfg/bin/lfg.ts` | Non-mutating plan surface. |
| `lfg --json setup --run` | `plugins/lfg/bin/lfg.ts`, `plugins/lfg/bin/lfg-installer.ts` | Structured Grok install result. |
| `runGrokInstall()` | `plugins/lfg/grok-install/run-grok-install.ts` | Single transaction for internal install + config/agents. |
| `runInternalGrokInstall()` | `plugins/lfg/grok-install/run-internal.ts` | Materializes adapter payload. |
| `syncLazycodexAgentsToGrokLedger()` | `plugins/lfg/grok-install/sync-lazycodex-agents-to-grok.ts` | Writes Grok role TOMLs/prompts. |
| Build | `scripts/build.mjs` | Bundles dist and copies install assets/skills. |
| Pack contract | `scripts/assert-npm-pack-bin.mjs`, `plugins/lfg/bin/npm-pack-*.test.ts` | Guards tarball/bin shape. |

## COMMANDS

```sh
npm run build
npm test
npm run typecheck
npm run self-test
npm run verify
npm run assert-pack
npm run pre-publish-check
node plugins/lfg/dist/lfg.js --json setup
node plugins/lfg/dist/lfg.js --json setup --run
```

## CONVENTIONS

- Keep npm/npx as the project toolchain; do not add Bun scripts or runtime dependencies.
- Keep root `package.json` as the publish target. `plugins/lfg/package.json` is workspace/dev-local.
- Keep CLI, package metadata, docs, and skill copy consistent about Grok-first `setup --run`.
- Keep product framing and user-facing references anchored to `https://github.com/code-yeongyu/oh-my-openagent`, explicitly calling out both the **codex adapter** core feature and the **opencode** feature when describing lfg’s lineage or purpose.
- Keep `lfgIsPlugin: false`; this repo is a setup helper/adapter package, not the Grok plugin/runtime itself.
- JSON CLI output is a contract. Update matching tests when fields or wording change.
- Build output under `plugins/lfg/dist/` is generated; change source or assets, then rebuild.
- `vitest.config.ts` intentionally disables file parallelism for pack/setup/model-server stability.

## ANTI-PATTERNS (THIS PROJECT)

- Reintroducing broad runtime surfaces.
- Adding a default setup path that writes to `~/.codex` via `npx lazycodex-ai install`.
- Letting non-setup commands silently write into `~/.grok`.
- Printing API keys in JSON output, logs, or summaries.
- Publishing from `plugins/lfg` instead of the repo root.
- Describing `lfg` as LFP, lazycodex itself, or a Grok plugin/runtime.
- Reviving deleted legacy product-shape files without an explicit request.

## NOTES

- Existing stamped Grok setups are preserved unless `--force` is explicit.
- `plugins/lfg/bin/` and `plugins/lfg/grok-install/` have local AGENTS files because they are the high-risk contract/install hotspots.
- `docs/` and `plans/` inherit root rules; planning docs are evidence/history, not active product API.