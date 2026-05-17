# Smoke verification

This repository treats smoke verification as the release gate for `linalab-io-framework/grok-build`.

## Local runtime smoke

Run from the repository root:

```sh
plugins/grok-harnessing/bin/self-test.sh
```

Expected terminal evidence:

```text
manifest-and-file-checks=ok
marketplace-metadata=ok
hook-smoke=ok
mcp-smoke=ok
team-dry-run=ok
runtime-smoke-coverage=100%
```

The self-test covers JSON manifests, marketplace metadata, hook redaction, MCP initialization/tool listing, tmux-team dry-run planning, and the full Python smoke matrix under `tests/smoke/`.


## Local `lfg` symlink install smoke

Install the local `lfg` command into PATH with:

```sh
scripts/install-lfg-symlink.sh
```

Expected terminal evidence:

```text
lfg-status=ok version=0.3.0
lfg-doctor=ok
```

The script creates symlinks for both `lfg` and its sibling `grok-build.py` target under `~/.local/bin` and `~/.grok/bin`, then verifies `lfg --json status` and `lfg --json doctor`.

## Real Grok install/discovery smoke

Run when the local Grok binary is available at `~/.grok/bin/grok`:

```sh
plugins/grok-harnessing/bin/grok-install-smoke.sh
```

Expected terminal evidence:

```text
plugin-sync=ok
grok-install-smoke=ok skills=28 key_skills_present
```

The script syncs `plugins/grok-harnessing/` into `~/.grok/plugins/grok-build/`, runs `grok --cwd /tmp inspect --json`, and asserts the installed plugin exposes 28 skills including the team, ultrawork, autopilot, ralplan, visual-ralph, performance-goal, autoresearch-goal, omx-setup, doctor, and wiki surfaces.

## GitHub Actions smoke

The workflow lives at:

```text
.github/workflows/smoke.yml
```

It runs on pushes to `main` and `p1`, and on pull requests targeting `main`. The workflow installs `tmux`, checks Python syntax, then runs:

```sh
plugins/grok-harnessing/bin/self-test.sh
```

A passing run must show the `grok-build smoke` workflow with the `smoke` job completed successfully.

You can verify the latest pushed `p1` commit from a machine with GitHub CLI auth:

```sh
scripts/verify-remote-smoke.sh p1
```

Expected terminal evidence:

```text
remote-smoke=ok
```
