# Development Guide

## Local Setup

1. Clone the repository
2. Install the local `lfg` / `ulw` symlinks:

```sh
plugins/lfg/bin/lfg setup
```

3. Verify basic surfaces:

```sh
lfg status
lfg doctor
lfg agents list
```

## Running Tests

```sh
# Dependency-free smoke
bun test plugins/lfg/src/runtime-ts plugins/lfg/src/mcp-ts plugins/lfg/src/hooks-ts plugins/lfg/src/smoke-ts plugins/lfg/test-utils

# Full local self-test (recommended before any push)
bun plugins/lfg/bin/self-test.ts
```

## Code Organization

- `plugins/lfg/src/runtime-ts/index.ts` — main runtime (dependency-free TypeScript/Bun)
- `plugins/lfg/src/agents/*.json` — canonical OMO agent definitions (SSOT)
- `plugins/lfg/src/agents/` — bundled agent definitions and harness metadata
- `docs/` — architecture, smoke, release contracts
- `plugin smoke checks ` — verification and release gates

## Contribution Rules

- Never weaken exact evidence string assertions.
- Classify every new or changed test according to `docs/TEST_RULES.md`.
- Do not reintroduce legacy Codex-derived workflow identity.
- Update `docs/HOW-IT-WORKS.md` and the Wiki when runtime behavior changes.
- Run `bun plugins/lfg/bin/self-test.ts` before opening a PR.

## Useful Commands

```sh
lfg doctor
lfg --json agents inspect sisyphus
lfg spawn sisyphus-junior --category quick --task "smoke test"
lfg team preflight
```

## Getting Help

- Architecture questions → read `docs/ARCHITECTURE.md` and `docs/HOW-IT-WORKS.md`
- Verification questions → read `docs/SMOKE.md` and `docs/TEST_RULES.md`
- Release questions → read `docs/RELEASE_CHECKLIST.md`

---

**See also**: [How It Works](./How-It-Works.md)
