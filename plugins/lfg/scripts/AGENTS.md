# scripts/AGENTS.md

## OVERVIEW
This directory is intentionally small. It owns the TypeScript global hook-bridge helpers that support Grok integration checks without reintroducing shell-first release gates.

## WHERE TO LOOK
- `hook-bridge-install.ts`: Installs the global hook-bridge entrypoint for Grok-facing workflows.
- `hook-bridge-verify.ts`: Verifies the hook-bridge install and bounded integration assumptions.
- `../bin/self-test.ts`: Canonical Bun smoke bundle for local release-readiness evidence.
- `../../docs/SMOKE.md`: Source of truth for focused gates, evidence strings, and the manual Grok native-spawn gate.

## CONVENTIONS
- Keep these helpers dependency-light TypeScript so marketplace users with Bun or compiled JS can run them.
- Use bounded filesystem operations and explicit verification output; never rely on implicit host state.
- Emit exact `*=ok` evidence strings. Docs and self-test assert many of them literally.
- Separate missing environment from product failure in environment/manual gates.
- Route release-readiness verification through `bun plugins/lfg/bin/self-test.ts`, not ad-hoc shell bundles.

## ANTI-PATTERNS
- Do not turn a product failure into a skipped gate unless `docs/TEST_RULES.md` classifies it as environment/manual.
- Do not document removed `verify-*.sh` or `install-*.sh` gates as active product surfaces.
- Do not silently change evidence string spelling.
- Do not print secrets or token-like values while proving hook redaction.

## COMMANDS
```sh
bun plugins/lfg/scripts/hook-bridge-install.ts --help
bun plugins/lfg/scripts/hook-bridge-verify.ts --help
bun plugins/lfg/bin/self-test.ts
```

## NOTES
- These helpers support hook-bridge setup and verification; they are not a replacement for the canonical smoke bundle.
- CI contract lives in `.github/workflows/smoke.yml` and centers on Bun tests, tmux install, and `bun plugins/lfg/bin/self-test.ts`.
