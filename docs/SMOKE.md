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
mcp-stdio-isolation=ok
state-schema-versioning=ok
release-notes=ok
marketplace-source=ok
grok-hook-discovery=ok
grok-global-hook-bridge=ok
release-tag=ok
grok-plugins-surface=ok
team-dry-run=ok
team-tmux-lifecycle=ok
runtime-smoke-coverage=100%
```

The self-test covers JSON manifests, marketplace metadata, hook redaction, MCP initialization/tool listing, MCP stdio isolation, state schema/versioning, marketplace release-note coverage, hosted marketplace source coverage, Grok hook discovery/replay coverage, global hook bridge workaround coverage, release tag coverage, Grok `/plugins` installed-surface coverage, tmux-team dry-run planning, actual tmux team create/status/resume/shutdown lifecycle, and the full Python smoke matrix under `tests/smoke/`.



## Aggregated local release-readiness smoke

Run the local release-readiness bundle before pushing or tagging:

```sh
scripts/verify-release-readiness-local.sh
```

Expected terminal evidence:

```text
release-readiness-local=ok
```

This runs the self-test plus focused team preflight/provider, tmux lifecycle, installed `lfg`, and installed MCP surface gates.

## Local `lfg` symlink install smoke

Install the local `lfg` command into PATH with:

```sh
scripts/install-lfg-symlink.sh
scripts/verify-installed-lfg-symlink-surface.sh
scripts/verify-lfg-inside-tmux-attach.sh
```

Expected terminal evidence:

```text
lfg-launch=ok
lfg-status=ok version=0.3.0
lfg-doctor=ok
lfg-installed-symlink-surface=ok
lfg-inside-tmux-attach=ok
```

The script creates symlinks for both `lfg` and its sibling `grok-build.py` target under `~/.local/bin` and `~/.grok/bin`, then verifies `lfg --json status` and `lfg --json doctor`. `scripts/verify-installed-lfg-symlink-surface.sh` additionally proves both installed symlink locations point at the repo runtime and that launching installed `lfg` creates the `lfg-backend` tmux session and that installed `lfg --json slash '/team providers'` returns the provider matrix and installed `lfg --json slash '/team preflight'` verifies tmux/provider readiness and includes actionable next commands. `scripts/verify-lfg-inside-tmux-attach.sh` launches `lfg` from inside a real tmux pane and verifies it opens a split-window attach pane instead of stealing the current client.

For a focused default-launch check, run:

```sh
scripts/verify-lfg-launch.sh
```

Expected terminal evidence:

```text
lfg-launch-smoke=ok
```

## Focused Grok `/plugins` surface smoke

Run the installed plugin slash-surface gate:

```sh
scripts/verify-grok-plugins-surface.sh
```

Expected terminal evidence:

```text
grok-plugins-list=ok
grok-plugins-surface=ok
```

The script syncs the plugin into `~/.grok/plugins/grok-build`, runs a real Grok headless `/plugins list` slash command, and asserts Grok reports `grok-build v0.3.0 (user)` with `28 skills, hooks: active, 1 MCP servers`.

## Focused global hook bridge smoke

Run the optional global hook bridge workaround gate:

```sh
lfg --json hook-bridge status
lfg --json hook-bridge install
lfg --json slash '/hook-bridge status'
scripts/verify-grok-build-global-hook-bridge.sh
scripts/verify-grok-installed-mcp-surface.sh
```

Expected terminal evidence:

```text
grok-global-hook-bridge=ok
grok-installed-mcp-surface=ok
```

This proves Grok `0.1.211` can execute the same audit hook through a global hook bridge while plugin hook scope remains blocked. The runtime command `lfg hook-bridge install` writes `~/.grok/hooks/grok-build-audit-bridge.{json,sh}`. `lfg hook-bridge status` is surfaced through `doctor` as `global_hook_bridge`, through `/hook-bridge status`, and through the MCP tools `grok_build_runtime`/`grok_build_hook_bridge`. `scripts/verify-grok-installed-mcp-surface.sh` first syncs the plugin into `~/.grok/plugins/grok-build`, then invokes the installed MCP server over stdio to prove the installed package exposes `grok_build_hook_bridge`, `grok_build_team(action=providers)`, and `grok_build_team(action=preflight)`, including actionable preflight commands.

## Focused release tag smoke

After creating/pushing a release tag, run:

```sh
scripts/verify-release-tag.sh grok-build-v0.3.0-p1
scripts/verify-release-tag.sh --remote grok-build-v0.3.0-p1
```

Expected terminal evidence:

```text
release-tag=ok tag=grok-build-v0.3.0-p1
release-tag-remote=ok tag=grok-build-v0.3.0-p1
```

## Focused Grok hook discovery smoke

Run the real Grok inspect + hook replay gate:

```sh
scripts/verify-grok-hook-discovery.sh
```

Expected terminal evidence:

```text
grok-hook-discovery=ok
hook-event-replay=ok
grok-headless-session=ok
```

The script syncs the plugin, verifies real `grok inspect --json` discovers the installed plugin hook file, replays a Grok-style hook event through the installed hook script, verifies redaction, and runs a short real Grok headless session. For the current headless limitation evidence, run `scripts/verify-grok-hook-headless-limitation.sh`; expected local evidence is `grok-real-tool-session=ok` and `grok-headless-hook-emission=not-observed grok=0.1.211`. For `/hooks-list` headless limitation evidence, run `scripts/verify-grok-hooks-slash-limitation.sh`; expected evidence is `grok-hooks-list-headless=not-observed reason=max_turns-exceeded`. For automated TUI PTY limitation evidence, run `scripts/verify-grok-tui-hook-limitation.sh`; expected local evidence is `grok-tui-hook-session=attempted` and `grok-tui-hook-emission=not-observed grok=0.1.211`. For global-vs-plugin hook scope evidence, run `scripts/verify-grok-plugin-hook-scope-limitation.sh`; expected evidence is `grok-global-hook-engine=ok` and `grok-plugin-hook-scope=not-observed while-global-hooks-ok`.

## Focused marketplace source smoke

Run the local marketplace metadata/source gate:

```sh
scripts/verify-marketplace-source.sh
```

Expected terminal evidence:

```text
marketplace-source=ok
```

For remote raw GitHub evidence on the current preview branch, run:

```sh
scripts/verify-marketplace-source.sh --remote p1
```

Expected terminal evidence:

```text
marketplace-remote-source=ok branch=p1
marketplace-source=ok
```

## Focused marketplace release notes smoke

Run the release-note coverage gate:

```sh
scripts/verify-release-notes.sh
```

Expected terminal evidence:

```text
release-notes=ok
```

The script asserts the release notes mention the plugin version, package name, marketplace source, plugin path, oh-my-codex reference, `/plugins` install path, and all required release evidence strings.

## Focused state schema/versioning smoke

Run the state schema gate:

```sh
scripts/verify-state-schema.sh
```

Expected terminal evidence:

```text
state-schema-file=ok
state-schema-doctor=ok
state-schema-versioning=ok
```

The script asserts plugin-data state creates `state/schema.json`, records schema version `1`, keeps migration history, and exposes the `state_schema` doctor check.

## Focused MCP stdio isolation smoke

Run the MCP protocol isolation gate with both successful and failing tool calls:

```sh
scripts/verify-mcp-stdio-isolation.sh
```

Expected terminal evidence:

```text
mcp-stdout-jsonrpc=ok
mcp-stderr-isolated=ok
mcp-stdio-isolation=ok
```

The script asserts stdout contains only parseable JSON-RPC response lines and stderr remains empty; child tool failures must be captured inside JSON payloads instead of leaking onto MCP stderr.

## Focused tmux team lifecycle smoke

Run the team backend lifecycle gate without launching real Hermes/Claude/Codex workers:

```sh
scripts/verify-team-tmux-lifecycle.sh
```

Expected terminal evidence:

```text
team-create=ok
team-status=ok
team-resume=ok
team-shutdown=ok
team-tmux-lifecycle=ok
```

Team preflight smoke:

```sh
scripts/verify-team-preflight.sh
```

Expected terminal evidence:

```text
team-preflight-cli=ok
team-preflight-commands=ok
team-preflight-slash=ok
team-preflight-mcp=ok
```

This verifies `lfg team preflight`, `/team preflight`, and MCP `grok_build_team(action=preflight)` all check tmux backend availability and provider readiness before starting a team, and return actionable next commands for provider listing, backend attach/status, and noop team smoke creation.

Provider command smoke:

```sh
scripts/verify-team-provider-commands.sh
```

Expected terminal evidence:

```text
team-provider-matrix=ok
team-provider-slash=ok
team-provider-commands=ok
team-provider-doctor=ok
```

This verifies the team provider matrix and command contract for `hermes -z`, `claude --permission-mode bypassPermissions`, `codex`, and the builtin `noop` provider used by tmux lifecycle smoke. The same provider matrix is available from `lfg team providers`, `/team providers`, and MCP `grok_build_team(action=providers)`.

The script uses a `noop` provider so it verifies tmux session/window lifecycle without requiring external agent CLIs.

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


## Aggregated remote release-readiness smoke

After pushing and force-updating the preview tag, verify the remote CI run and remote tag together:

```sh
scripts/verify-release-readiness-remote.sh p1 grok-build-v0.3.0-p1
```

Expected terminal evidence:

```text
release-readiness-remote=ok
```

This wraps `scripts/verify-remote-smoke.sh p1` and `scripts/verify-release-tag.sh --remote grok-build-v0.3.0-p1`.

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
