# Release checklist

Use this checklist before merging or tagging `linalab-io/lfg`.

## Required gates

- [ ] Python syntax passes for runtime, MCP, and smoke tests.
- [ ] Plugin self-test passes and emits `runtime-smoke-coverage=100%`.
- [ ] Manifest/catalog/docs check emits `manifest-and-file-checks=ok`.
- [ ] Marketplace metadata check emits `marketplace-metadata=ok` and still points to `linalab-io/lfg`.
- [ ] Release notes/source docs checks emit `release-notes=ok` and `marketplace-source=ok`.
- [ ] MCP stdio check emits `mcp-stdio-isolation=ok` and `mcp-stderr-isolated=ok`.
- [ ] State schema checks emit `state-schema-versioning=ok` and `state-schema-doctor=ok`.
- [ ] Team checks emit `team-dry-run=ok` and `team-tmux-lifecycle=ok`.
- [ ] Slash/MCP team surfaces still expose `/team providers`, `/team preflight`, and `grok_build_team.preflight` with preflight `commands=ok`.
- [ ] Doctor diagnostics include `grok_marketplace` and `agents_marketplace`.
- [ ] Real Grok install smoke emits `grok-install-smoke=ok skills=28 key_skills_present` when a Grok install is available.

## Commands

```sh
python3 -m py_compile plugins/lfg/bin/lfg.py plugins/lfg/bin/lfg-mcp.py tests/smoke/test_grok_build_runtime.py
plugins/lfg/bin/self-test.sh
python3 -m ruff check .
plugins/lfg/bin/grok-install-smoke.sh
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

Do not tag or merge unless the required local gate passes. Remote marketplace or Grok UI evidence is environment/manual and should be recorded separately when release scope requires it.
