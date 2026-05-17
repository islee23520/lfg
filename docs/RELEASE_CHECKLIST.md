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
