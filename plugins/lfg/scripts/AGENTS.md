# scripts/AGENTS.md

## OVERVIEW
Executable verification gates for local smoke, release readiness, marketplace metadata, Grok install surface, tmux lifecycle, MCP isolation, state schema, and remote GitHub Actions evidence.

## WHERE TO LOOK
- `verify-release-readiness-local.sh`: Aggregates self-test, team preflight/provider/tmux, installed symlink, installed MCP gates.
- `verify-release-readiness-remote.sh`: Wraps remote smoke plus remote release-tag verification.
- `verify-release-readiness-all.sh`: Local plus remote aggregate.
- `install-lfg-symlink.sh`: Installs `lfg`, `ulw`, and `lfg.py` symlinks then verifies launch/status/doctor.
- `verify-team-*.sh`: Provider matrix, preflight commands, and real tmux lifecycle.
- `verify-grok-*.sh`: Real Grok install, plugin surface, hook discovery, and known hook limitations.
- `verify-lfg-inside-tmux-attach.sh`: No-arg inside-tmux runtime status evidence, currently `lfg-inside-tmux-status=ok`.
- `verify-mcp-stdio-isolation.sh`: JSON-RPC stdout and stderr isolation.
- `verify-state-schema.sh`: `.lfg/state/schema.json` and doctor state schema check.
- `verify-remote-smoke.sh`: Uses `gh run list` and `gh run view` for latest pushed commit evidence.
- `hook-bridge-install.py` / `hook-bridge-verify.py`: Python global hook bridge installer and manual Grok integration verifier.

## CONVENTIONS
- Use `set -euo pipefail` for shell gates; use stdlib-only Python for hook bridge scripts.
- Use `mktemp`/`trap` or `tempfile`/`try-finally` for disposable state and tmux cleanup.
- Emit exact `*=ok` evidence strings. Docs and self-test assert many of them literally.
- Use embedded Python for JSON inspection instead of brittle shell parsing.
- Use pytest for deterministic Python behavior tests instead of adding shell-only test scripts.
- Separate missing environment from product failure in environment/manual gates.

## ANTI-PATTERNS
- Do not turn a product failure into a skipped gate unless `docs/TEST_RULES.md` classifies it as environment/manual.
- Do not leave tmux sessions or temp directories behind.
- Do not silently change evidence string spelling.
- Do not restore old attach evidence names when scripts/docs/tests now assert runtime status evidence.
- Do not print secrets or token-like values while proving hook redaction.

## COMMANDS
```sh
scripts/verify-release-readiness-local.sh
scripts/install-lfg-symlink.sh
scripts/verify-mcp-stdio-isolation.sh
scripts/verify-state-schema.sh
```

## NOTES
- Scripts are executable smoke gates and part of the release contract.
- CI installs tmux, py-compiles `plugins/lfg/bin/lfg.py` and `plugins/lfg/bin/lfg-mcp.py`, then runs `python3 plugins/lfg/bin/self-test.py`.
