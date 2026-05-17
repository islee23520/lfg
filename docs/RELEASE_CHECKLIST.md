# Release checklist

Use this checklist before merging or tagging `linalab-io-framework/grok-build`.

## Required release gates

- [ ] Local smoke passes with `runtime-smoke-coverage=100%`.
- [ ] Real Grok install smoke passes with `grok-install-smoke=ok skills=28 key_skills_present`.
- [ ] Local `lfg` symlink installer passes with `lfg-launch=ok
lfg-status=ok version=0.3.0` and `lfg-doctor=ok`.
- [ ] Team tmux lifecycle smoke passes with `team-tmux-lifecycle=ok`.
- [ ] MCP stdio isolation smoke passes with `mcp-stdio-isolation=ok`.
- [ ] State schema/versioning smoke passes with `state-schema-versioning=ok`.
- [ ] Marketplace release notes smoke passes with `release-notes=ok`.
- [ ] Marketplace source smoke passes with `marketplace-source=ok` and preview remote smoke passes with `marketplace-remote-source=ok branch=p1`.
- [ ] Grok hook discovery/replay smoke passes with `grok-hook-discovery=ok`, `hook-event-replay=ok`, and `grok-headless-session=ok`.
- [ ] Optional global hook bridge workaround smoke passes with `grok-global-hook-bridge=ok`.
- [ ] Release tag smoke passes with `release-tag=ok` and `release-tag-remote=ok`.
- [ ] Grok `/plugins` installed-surface smoke passes with `grok-plugins-surface=ok`.
- [ ] Remote GitHub Actions smoke passes with `remote-smoke=ok` for the latest pushed commit.
- [ ] Roadmap coverage guard confirms `roadmap=27/27` non-harness skill surfaces.
- [ ] Feature-doc coverage guard confirms `feature_docs=27/27` non-harness skill surfaces.
- [ ] Marketplace metadata still points to `linalab-io-framework/grok-build`.
- [ ] Doctor diagnostics include `grok_marketplace` and `agents_marketplace` checks.

## Commands

```sh
plugins/grok-harnessing/bin/self-test.sh
scripts/install-lfg-symlink.sh
scripts/verify-lfg-launch.sh
scripts/verify-team-tmux-lifecycle.sh
scripts/verify-mcp-stdio-isolation.sh
scripts/verify-state-schema.sh
scripts/verify-release-notes.sh
scripts/verify-marketplace-source.sh
scripts/verify-marketplace-source.sh --remote p1
scripts/verify-grok-hook-discovery.sh
scripts/verify-grok-build-global-hook-bridge.sh
scripts/verify-release-tag.sh grok-build-v0.3.0-p1
scripts/verify-release-tag.sh --remote grok-build-v0.3.0-p1
scripts/verify-grok-plugins-surface.sh
plugins/grok-harnessing/bin/grok-install-smoke.sh
scripts/verify-remote-smoke.sh p1
```

## Expected installed surface

The real Grok inspect smoke must discover exactly 28 skills from the plugin, including:

```text
team
ultrawork
autopilot
ralplan
autoresearch-goal
performance-goal
visual-ralph
omx-setup
doctor
wiki
```

## Stop condition

Do not tag or merge unless all commands above pass and the latest GitHub Actions `grok-build smoke` run is `completed` with conclusion `success`.
