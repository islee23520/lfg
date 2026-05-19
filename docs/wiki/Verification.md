# Verification & Smoke

`lfg` treats exact evidence strings as **product contracts**. No claim is accepted without a matching `*=ok` line.

## Gate Classes (from TEST_RULES.md)

| Class | Description | Example Commands |
|-------|-------------|------------------|
| **Dependency-free smoke** | Runs with temporary state, no real Grok, no tmux, no provider credentials | `python3 -m unittest tests.smoke.test_grok_build_runtime -v` |
| **Repo-native integration** | Uses local binaries, filesystem, deterministic fakes | `python3 -m unittest tests.smoke.test_grok_build_runtime -v`, focused verify scripts |
| **Environment/manual** | Requires tmux, real Grok, installed symlinks, marketplace state | `plugins/lfg/bin/self-test.sh` |

## Required Local Smoke

```sh
plugins/lfg/bin/self-test.sh
```

Must produce (among many others):

```
manifest-and-file-checks=ok
mcp-stdio-isolation=ok
team-tmux-lifecycle=ok
runtime-smoke-coverage=100%
```

## Aggregated Release Readiness

```sh
plugins/lfg/bin/self-test.sh
plugins/lfg/bin/self-test.sh plus marketplace remote smoke
```

These wrap the self-test plus focused gates for:
- Installed `lfg` symlink surface
- Team preflight & provider matrix
- Grok hook discovery & replay
- Marketplace source & release notes
- Remote GitHub Actions smoke

## Key Evidence Contracts

- `grok-install-smoke=ok skills=28 key_skills_present`
- `team-tmux-lifecycle=ok`
- `mcp-stdio-isolation=ok`
- `state-schema-versioning=ok`
- `release-readiness-all=ok`

All evidence strings are defined in `docs/SMOKE.md` and asserted literally by scripts and tests.

## Philosophy

- Flaky tests or tests that only pass with sleeps/retries are considered failing until the contract is clarified.
- Every new or changed test must be classified into one of the three gate classes.
- Exact JSON, MCP, CLI, and prompt-identity assertions are valid behavior contracts.

---

**See also**: [Release Process](./Release-Process.md), [How It Works](./How-It-Works.md)
