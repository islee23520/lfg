# PROJECT KNOWLEDGE BASE

**Generated:** 2026-06-14
**Commit:** 169618c
**Branch:** main

## OVERVIEW

`lfg` is the npm entry for an **omo / lazycodex Grok Build adapter**. The default install path is Grok-first: `setup --run` materializes the internal grok-install payload under native `~/.grok/plugins/lfg` (with legacy `~/.grok/installed-plugins/lfg` treated as a migration/fallback location) and does not require `npx lazycodex-ai install` into `~/.codex`.

## STRUCTURE

```text
./
├── bin/              # published npm bin shim
├── src/              # TypeScript source; own scoped instructions
│   ├── cli/          # CLI, JSON contracts, package/publish helpers, dense tests
│   └── grok-adapter/ # internal Grok installer, hooks, agent sync, fixtures
├── skills/           # user-facing skill copy shipped with the package
├── dist/             # generated runtime bundle and install payload
├── scripts/          # root build and publish/readiness helpers
├── docs/             # adapter ownership/parity/config/publish docs
├── components/       # small MCP helper shims shipped as dist-only component CLIs
├── plans/            # planning history; do not treat as product surface
└── tests/            # narrow repo-level test scope; own scoped instructions
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Change CLI output or routing | `src/cli/lfg.ts` | Command set stays `setup`. |
| Change setup plan JSON | `src/cli/lfg.ts`, `src/cli/setup-json-contract.ts` | Tests assert exact fields. |
| Change installer orchestration | `src/cli/lfg-installer.ts`, `src/grok-adapter/run-grok-install.ts` | Grok `~/.grok` path only by default. |
| Change Grok install filesystem behavior | `src/grok-adapter/` | Explicit `setup --run` / confirmed interactive setup only. |
| Change model discovery or aliases | `src/cli/lfg-models.ts`, `src/grok-adapter/*config*` | Keep JSON output and config writes stable. |
| Change hooks or trust behavior | `src/grok-adapter/*hook*`, `src/grok-adapter/assets/` | Bridge wrapping must stay idempotent. |
| Change agent TOML sync or overrides | `src/grok-adapter/*agent*`, `src/grok-adapter/flavour-pack-assets/` | Grok-first defaults; user overrides win. |
| Change publish/package shape | `package.json`, `bin/lfg.js`, `scripts/`, `src/cli/*publish*`, `src/cli/*pack*` | Publish from repo root. |
| Change user-facing skill copy | `skills/` | Keep Grok-first `lfg setup` wording aligned. |
| Change docs | `docs/` | Docs are tested by `*-doc.test.ts` files under `src/cli`. |
| Change MCP helper shims | `components/*/.mcp.json`, `components/*/dist/cli.js` | Dist-only helper surface; do not broaden product runtime. |

## CODE MAP

| Surface | Location | Role |
|---------|----------|------|
| `lfg setup` | `src/cli/lfg.ts` | Human interactive installer. |
| `lfg --json setup` | `src/cli/lfg.ts` | Non-mutating plan surface. |
| `lfg --json setup --run` | `src/cli/lfg.ts`, `src/cli/lfg-installer.ts` | Structured Grok install result. |
| `runGrokInstall()` | `src/grok-adapter/run-grok-install.ts` | Single transaction for internal install + config/agents. |
| `runInternalGrokInstall()` | `src/grok-adapter/run-internal.ts` | Materializes adapter payload. |
| `syncLazycodexAgentsToGrokLedger()` | `src/grok-adapter/sync-lazycodex-agents-to-grok.ts` | Writes Grok role TOMLs/prompts. |
| Build | `scripts/build.mjs` | Bundles dist and copies install assets/skills. |
| Pack contract | `scripts/assert-npm-pack-bin.mjs`, `src/cli/npm-pack-*.test.ts` | Guards tarball/bin shape. |

## COMMANDS

```sh
npm run build
npm test
npm run typecheck
npm run self-test
npm run verify
npm run assert-pack
npm run pre-publish-check
node dist/lfg.js --json setup
node dist/lfg.js --json setup --run
```

## CONVENTIONS

- Keep npm/npx as the project toolchain; do not add Bun scripts or runtime dependencies.
- Keep root `package.json` as the only publish target; there is no nested package manifest.
- Keep CLI, package metadata, docs, and skill copy consistent about Grok-first `setup --run`.
- Public setup/refresh/install paths must target the real account Grok home from `os.userInfo().homedir`; do not route production installs through an alternate `HOME`, temp home, or custom Grok home. Test isolation may use only the explicit `LFG_ALLOW_TEST_GROK_HOME=1` gate.
- Keep product framing and user-facing references anchored to `https://github.com/code-yeongyu/oh-my-openagent`, explicitly calling out both the **codex adapter** core feature and the **opencode** feature when describing lfg’s lineage or purpose.
- Keep `lfgIsPlugin: false`; this repo is a setup helper/adapter package, not the Grok plugin/runtime itself.
- JSON CLI output is a contract. Update matching tests when fields or wording change.
- Build output under `dist/` is generated; change source or assets, then rebuild.
- `vitest.config.ts` intentionally disables file parallelism for pack/setup/model-server stability.

## ANTI-PATTERNS (THIS PROJECT)

- Reintroducing broad runtime surfaces.
- Adding a default setup path that writes to `~/.codex` via `npx lazycodex-ai install`.
- Letting non-setup commands silently write into `~/.grok`.
- Printing API keys in JSON output, logs, or summaries.
- Publishing from `src` instead of the repo root.
- Describing `lfg` as LFP, lazycodex itself, or a Grok plugin/runtime.
- Reviving deleted legacy product-shape files without an explicit request.

## NOTES

- Existing stamped Grok setups are preserved unless `--force` is explicit.
- `src/cli/` and `src/grok-adapter/` have local AGENTS files because they are the high-risk contract/install hotspots.
- `docs/` and `plans/` inherit root rules; planning docs are evidence/history, not active product API.
- `components/*` is intentionally tiny MCP helper packaging. Add scoped guidance only if it gains source, tests, or real ownership complexity.
