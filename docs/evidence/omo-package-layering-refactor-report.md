# OMO Package Layering Refactor Report

## Purpose

Summarize how the local Oh My OpenAgent reference tree at `~/.config/opencode/plugins/omo` approaches the package-layering refactor, with special attention to the AST-grep migration and the claim that projects were moved toward pure TypeScript packages.

This report is documentation evidence only. It does not claim new LFG runtime behavior.

## Source Scope

Per the `@docs/` lookup rule, `docs/docs-index.json` was read first. The OMO reference path inspected was:

```text
~/.config/opencode/plugins/omo
```

Primary OMO files read:

- `README.md`
- `ROADMAP.md`
- `AGENTS.md`
- `package.json`
- `packages/AGENTS.md`
- `packages/rules-core/*`
- `packages/ast-grep-mcp/*`
- `src/mcp/ast-grep.ts`
- `src/mcp/index.ts`
- `script/build-binaries.ts`
- `bin/platform.js`
- `bin/oh-my-opencode.js`
- `postinstall.mjs`
- `.github/workflows/ci.yml`
- `.github/workflows/publish.yml`
- `.github/workflows/publish-platform.yml`

Local git history was also inspected for the package extraction sequence.

## Ranked Synthesis

| Rank | Explanation | Confidence | Basis |
| --- | --- | --- | --- |
| 1 | OMO's stated refactor is a strict layer split: pure TypeScript core, stdio MCP servers, static skills, thin harness adapters, platform binaries, and web as separate boundaries. | High | `ROADMAP.md:21-40`, `README.md:137-141` |
| 2 | The clearest “pure TypeScript package” extraction currently visible is `packages/rules-core`: rule discovery, AGENTS.md lookup, matching, parsing, scanner/cache utilities moved into a reusable workspace package, while OpenCode hook files delegate/re-export from it. | High | `packages/rules-core/package.json:1-20`, `packages/rules-core/src/index.ts:1-20`, `src/hooks/rules-injector/*.ts`, commit `fb7d47f1`, commit `4ea29e2c` |
| 3 | AST-grep was not converted into a pure TypeScript parser. OMO converted its AST-grep integration from a first-party native tool directory into a package-backed local stdio MCP written in TypeScript, which still shells out to the AST-grep CLI binary. | High | `packages/ast-grep-mcp/package.json:15-22`, `packages/ast-grep-mcp/src/mcp.ts:101-167`, `packages/ast-grep-mcp/src/runner.ts:31-58`, `packages/ast-grep-mcp/src/sg-cli-path.ts:32-74`, commit `499aff01`, commit `a86cc6af` |
| 4 | Distribution was handled by keeping the root package and platform binaries as deployment leaves: root `files` includes built MCP dist output, platform binaries are optional dependencies, `postinstall` verifies binary availability, and the JS bin shim selects the correct platform package with baseline fallback. | Medium-High | `package.json:16-22`, `package.json:97-109`, `postinstall.mjs:89-130`, `bin/platform.js:10-81`, `bin/oh-my-opencode.js:83-148`, `script/build-binaries.ts:18-70` |
| 5 | The migration was staged and test-gated through commits: add package, delegate old hook surfaces, add package-backed MCP, register as built-in MCP, remove old native AST-grep tool, then wire release gates and document the roadmap. | Medium | Local git history: `fb7d47f1`, `4ea29e2c`, `499aff01`, `ef09880e`, `a86cc6af`, `06f67093`, `ff78aeda` |

## Evidence

### 1. Refactor contract: package layers and dependency direction

**Evidence** — `~/.config/opencode/plugins/omo/ROADMAP.md:21-40` defines the current priority as a package layering refactor. It says the current `packages/` directory mixes binaries, web apps, MCP servers, and pure TypeScript logic, then defines these layers:

- Core: pure TypeScript logic with no harness dependencies.
- MCP: external tool servers such as LSP and AST-grep behind a stdio process boundary.
- Skills: static `SKILL.md` files.
- Adapters: harness-specific glue such as OpenCode, Pi, and Codex.
- Platform: Bun-compiled binaries.
- Web: independent marketing site.

**Evidence** — `~/.config/opencode/plugins/omo/ROADMAP.md:38-40` also states the dependency direction and migration principle: adapters depend on core/MCP/skills, nothing depends on adapters, and each extraction should preserve behavior by moving logic into core, re-exporting from the original location, verifying tests, and then deleting duplicates elsewhere.

**Inference** — The refactor is not just “convert everything to TypeScript.” It is a runtime-boundary split: reusable logic becomes pure TS core, external tools become MCP packages, harness APIs stay thin, and compiled binaries stay deployment-only.

### 2. Pure TypeScript core pattern: `rules-core`

**Evidence** — `~/.config/opencode/plugins/omo/packages/rules-core/package.json:1-20` defines `@oh-my-opencode/rules-core` as a private ESM workspace package whose description is “Pure TypeScript rule discovery, matching, and nested AGENTS.md context utilities.” It exports `./src/index.ts` and type declarations and has only `picomatch` as a runtime dependency.

**Evidence** — `~/.config/opencode/plugins/omo/packages/rules-core/src/index.ts:1-20` exports the reusable API: AGENTS.md lookup, rule-file discovery, frontmatter parsing, matching, project-root detection, scanning, distance, cache utilities, and types.

**Evidence** — Existing OpenCode hook surfaces delegate back to that package:

- `~/.config/opencode/plugins/omo/src/hooks/rules-injector/rule-file-finder.ts:1-7` imports the core deprecation logger hook and re-exports `findRuleFiles` from `@oh-my-opencode/rules-core`.
- `~/.config/opencode/plugins/omo/src/hooks/rules-injector/parser.ts:1-2` re-exports `parseRuleFrontmatter` from the core package.
- `~/.config/opencode/plugins/omo/src/hooks/rules-injector/matcher.ts:1-9` re-exports matcher functions from the core package.
- `~/.config/opencode/plugins/omo/src/hooks/rules-injector/project-root-finder.ts:1` re-exports project-root functions from the core package.
- `~/.config/opencode/plugins/omo/src/hooks/directory-agents-injector/finder.ts:1-17` delegates AGENTS.md upward search to `findAgentsMdUp` from the core package.

**Evidence** — Local git history shows the staging:

- `fb7d47f1 feat(rules): add shared rules-core package` added 16 files and 909 insertions under `packages/rules-core`.
- `4ea29e2c refactor(rules): delegate injectors to rules-core` changed 11 hook files with 65 insertions and 775 deletions.

**Inference** — This is the cleanest example of the roadmap's “pure move + re-export” migration principle. OMO first extracted the reusable logic, then shrank the harness-specific hook modules to compatibility wrappers.

### 3. AST-grep pattern: TypeScript MCP wrapper, not pure TS parser

**Evidence** — `~/.config/opencode/plugins/omo/packages/ast-grep-mcp/package.json:1-22` defines a private `@oh-my-opencode/ast-grep-mcp` package with a `dist/cli.js` bin, `bun build src/cli.ts --outdir dist --target node --format esm`, and a runtime dependency on `@ast-grep/cli`.

**Evidence** — `~/.config/opencode/plugins/omo/packages/ast-grep-mcp/src/mcp.ts:101-167` implements a small JSON-RPC MCP server in TypeScript. It handles `initialize`, `tools/list`, and `tools/call`, exposes `search` and `replace`, parses arguments, applies disabled-tool policy, and returns MCP text content.

**Evidence** — `~/.config/opencode/plugins/omo/packages/ast-grep-mcp/src/runner.ts:31-58` runs the actual AST-grep executable. If the CLI is missing, it returns install guidance for `@ast-grep/cli`, Cargo, or Homebrew. `runner.ts:152-178` constructs `sg run` arguments, including `--json=compact`, rewrite flags, context, globs, and paths.

**Evidence** — `~/.config/opencode/plugins/omo/packages/ast-grep-mcp/src/sg-cli-path.ts:32-74` resolves the binary from `@ast-grep/cli`, AST-grep platform packages, or Homebrew paths on macOS.

**Evidence** — `~/.config/opencode/plugins/omo/src/mcp/ast-grep.ts:64-97` registers the package as a local MCP config. It prefers `packages/ast-grep-mcp/dist/cli.js` with Node, falls back to `packages/ast-grep-mcp/src/cli.ts` with Bun for source checkouts, and passes `OMO_AST_GREP_WORKSPACE` plus disabled-tool mapping through the environment.

**Evidence** — `~/.config/opencode/plugins/omo/src/mcp/index.ts:42-48` registers both `lsp` and `ast_grep` as built-in local MCPs when not disabled.

**Evidence** — `~/.config/opencode/plugins/omo/src/mcp/ast-grep.test.ts:22-119` verifies the dist CLI path, Bun source fallback, missing-build fallback, protection from resolving MCP command from a malicious workspace, and disabled-tool mapping.

**Evidence** — `~/.config/opencode/plugins/omo/packages/ast-grep-mcp/src/mcp.test.ts:49-160` verifies MCP tool listing, search defaults, dry-run replace default, disabled replace behavior, and rejection of unsafe paths before the runner executes.

**Evidence** — Local git history shows the AST-grep transition:

- `499aff01 feat(mcp): add package-backed ast-grep MCP` added 19 files and 1,372 insertions under `packages/ast-grep-mcp`.
- `ef09880e feat(mcp): register ast-grep as built-in MCP` added `src/mcp/ast-grep.ts`, registry wiring, and tests.
- `a86cc6af refactor(tools): remove native ast-grep tool` deleted the old `src/tools/ast-grep/` implementation and removed it from tool registry surfaces.

**Inference** — “AST-grep moved to package” means the OMO-owned integration became a TypeScript MCP package with a stable stdio boundary. The underlying AST-grep engine remains an external binary dependency, so it should not be described as “pure TypeScript AST-grep.”

### 4. Build and release integration

**Evidence** — `~/.config/opencode/plugins/omo/package.json:8-11` declares workspaces for `packages/rules-core` and `packages/ast-grep-mcp`.

**Evidence** — `~/.config/opencode/plugins/omo/package.json:16-22` includes root package artifacts: `dist`, `bin`, `postinstall.mjs`, and built MCP dist directories for LSP and AST-grep.

**Evidence** — `~/.config/opencode/plugins/omo/package.json:30-47` builds AST-grep MCP before building the main plugin and CLI dist output. It also typechecks `packages/rules-core` and `packages/ast-grep-mcp` separately through `typecheck:packages`.

**Evidence** — `~/.config/opencode/plugins/omo/.github/workflows/ci.yml:55-61`, `ci.yml:83-89`, and `ci.yml:118-132` install dependencies with `BUN_INSTALL_ALLOW_SCRIPTS=@ast-grep/cli @ast-grep/napi`, run tests, typecheck, build, verify `dist/index.js` and `dist/index.d.ts`, and run a dist-bundle test.

**Evidence** — `~/.config/opencode/plugins/omo/.github/workflows/publish-platform.yml:181-216` builds `packages/ast-grep-mcp` before compiling each platform binary with `bun build src/cli/index.ts --compile --minify --target=...`.

**Evidence** — `~/.config/opencode/plugins/omo/script/build-binaries.ts:18-29` enumerates 11 platform targets, including x64 baseline and musl variants. `script/build-binaries.ts:41-70` compiles `src/cli/index.ts` with Bun and explicitly runs `bun run build:ast-grep-mcp` first.

**Inference** — The extracted MCP package is part of both npm package distribution and binary compilation gates. That keeps source-checkout ergonomics while making packaged installs prefer built artifacts.

### 5. Platform binary package pattern

**Evidence** — `~/.config/opencode/plugins/omo/package.json:97-109` lists 11 platform packages as optional dependencies, all pinned to the same version as the root package.

**Evidence** — `~/.config/opencode/plugins/omo/packages/AGENTS.md:18-24` documents platform packages as one package per OS/arch/variant. Each contains `bin/<binary>` and `package.json`, is built by `script/build-binaries.ts`, and is selected at install time by the bin shim plus `postinstall.mjs`.

**Evidence** — `~/.config/opencode/plugins/omo/bin/platform.js:10-81` maps platform/architecture/libc to package names, supplies x64 baseline fallback package names, and maps selected package names to `bin/oh-my-opencode` or `bin/oh-my-opencode.exe`.

**Evidence** — `~/.config/opencode/plugins/omo/bin/oh-my-opencode.js:83-148` detects libc and AVX2 support, resolves candidate platform packages, tries binaries in order, and falls back on `SIGILL` when another candidate exists.

**Evidence** — `~/.config/opencode/plugins/omo/postinstall.mjs:89-130` checks the local OpenCode version, resolves the expected platform binary package, prints success when it is found, and warns rather than failing installation if binary resolution fails.

**Inference** — OMO treats platform binaries as deployment leaves, not importable application logic. This matches the roadmap's “Platform” layer boundary.

## Transferable Pattern for LFG Docs/Runtime Work

**Inference** — If LFG copies this approach, the useful pattern is:

1. Put harness-neutral logic behind a small package/module boundary first.
2. Keep existing harness-facing files as thin delegates or re-exports until tests prove behavior did not change.
3. For external tools like AST-grep, prefer a local MCP/server boundary rather than embedding tool-specific logic directly in the main adapter.
4. Ship built server artifacts with the package, but keep a source-checkout fallback for local development.
5. Treat platform binaries as optional deployment artifacts selected by a small shim, not as a runtime dependency of core logic.
6. Use tests to prove path resolution, source/dist fallback, disabled-tool mapping, and workspace boundary safety.

## LFG Port Status — Applied Core Slices

The first LFG implementation slice now has code-level evidence under `plugins/lfg/src/core/`:

- `plugins/lfg/src/core/agent_registry.py` — dependency-free OMO agent discovery, team eligibility, category routing, and model-resolution policy.
- `plugins/lfg/src/core/spawn_policy.py` — dependency-free canonical spawn envelopes, manual-gate policy, internal supervision-broker records, and envelope validation.
- `plugins/lfg/src/core/atlas_boulder.py` — dependency-free Atlas task dependency progress, bounded delegation records, and Boulder migration/build helpers.

Runtime adapter evidence:

- `plugins/lfg/src/runtime/cli.py` loads `_AGENT_CORE`, `_SPAWN_CORE`, and `_ATLAS_CORE` from `plugins/lfg/src/core/`.
- Runtime wrappers delegate registry/model resolution to `_AGENT_CORE`, spawn envelope and validation logic to `_SPAWN_CORE`, and Atlas progress/Boulder helpers to `_ATLAS_CORE`.
- `plugins/lfg/bin/self-test.py` includes the core modules in manifest/file checks so the extraction is part of the release smoke contract.
- `tests/smoke/test_grok_build_runtime.py::RuntimeSmoke.test_lfg_core_agent_registry_layer` directly imports the core modules, checks they avoid transport/runtime dependencies such as `subprocess` and `urllib`, verifies runtime delegation strings, validates a core spawn envelope, and checks Atlas dependency progress.

Verification evidence captured after this slice:

```sh
python3 -m py_compile plugins/lfg/src/core/agent_registry.py plugins/lfg/src/core/spawn_policy.py plugins/lfg/src/core/atlas_boulder.py plugins/lfg/src/runtime/cli.py tests/smoke/test_grok_build_runtime.py plugins/lfg/bin/self-test.py
python3 -m ruff check plugins/lfg/src/core/agent_registry.py plugins/lfg/src/core/spawn_policy.py plugins/lfg/src/core/atlas_boulder.py plugins/lfg/src/runtime/cli.py tests/smoke/test_grok_build_runtime.py plugins/lfg/bin/self-test.py
python3 -m unittest tests.smoke.test_grok_build_runtime.RuntimeSmoke.test_lfg_core_agent_registry_layer tests.smoke.test_grok_build_runtime.RuntimeSmoke.test_spawn_adapter_t8_operations tests.smoke.test_grok_build_runtime.RuntimeSmoke.test_canonical_spawn_envelope_fixture_and_wave_order tests.smoke.test_grok_build_runtime.RuntimeSmoke.test_t16_atlas_resumes_with_wisdom_and_rejects_evidence_free_checkbox -v
```

## Unknowns / Limits

- **Unknown** — This read did not run OMO's test suite or build. The report is based on repository evidence and local git history only.
- **Unknown** — The roadmap says `comment-checker` and LSP client extraction are planned or in progress; this report only verifies `rules-core` and AST-grep evidence that is visible in the inspected tree.
- **Unknown** — `packages/AGENTS.md:7` says the root package files only ship `dist/`, `bin/`, and `postinstall.mjs`, but the current root `package.json:16-22` also ships built LSP and AST-grep MCP dist directories. Treat the package manifest as stronger evidence for current packaging.
- **Limit** — AST-grep's underlying executable remains external/native. The pure TypeScript part is OMO's MCP wrapper and integration code, not the AST engine.

## Status

Documentation evidence captured on 2026-05-20. The report itself is evidence
documentation; the companion LFG transfer slice is tracked above under
`plugins/lfg/src/core/` and covered by the listed smoke gates.
