# Release checklist

Use this checklist before merging or tagging `islee23520/lfg`.

## Required gates

- [ ] Python syntax passes for runtime, MCP, and smoke tests.
- [ ] Plugin self-test passes and emits `runtime-smoke-coverage=100%`.
- [ ] Manifest/catalog/docs check emits `manifest-and-file-checks=ok`.
- [ ] Marketplace metadata check emits `marketplace-metadata=ok` and still points to `islee23520/lfg`.
- [ ] Release notes/source docs checks emit `release-notes=ok` and `marketplace-source=ok`.
- [ ] MCP stdio check emits `mcp-stdio-isolation=ok` and `mcp-stderr-isolated=ok`.
- [ ] Hook continuation check emits `todo-continuation=ok` and proves reminders require incomplete work plus new progress evidence.
- [ ] State schema checks emit `state-schema-versioning=ok` and `state-schema-doctor=ok`.
- [ ] Team checks emit `team-dry-run=ok`, `models-auth=ok`, and `team-tmux-lifecycle=ok`.
- [ ] Slash/MCP team surfaces still expose `/team providers`, `/team preflight`, and `grok_build_team.preflight` with valid JSON output.
- [ ] Doctor diagnostics include `grok_marketplace` and `agents_marketplace`.
- [ ] Real Grok install smoke emits `grok-install-smoke=ok skills=21 key_skills_present` when a Grok install is available.
- [ ] Real Grok named sub-agent manual gate is either recorded with `grok-native-spawn-manual=ok` evidence, or explicitly recorded as `manual_gate_not_run` with native spawn still manual-gated.

## Commands

```sh
python3 -m py_compile plugins/lfg/bin/lfg.py plugins/lfg/bin/lfg-mcp.py plugins/lfg/bin/self-test.py plugins/lfg/bin/grok-install-smoke.py plugins/lfg/src/runtime/cli.py tests/smoke/test_grok_build_runtime.py
python3 plugins/lfg/bin/self-test.py
python3 -m ruff check .
python3 plugins/lfg/bin/grok-install-smoke.py
```

## Expected installed surface

The real Grok inspect smoke must discover exactly 21 skills from the plugin, including:

```text
agent-browser
ai-slop-remover
frontend-ui-ux
git-master
hyperplan
playwright
review-work
team-mode
work-with-pr
```

## Stop condition

Do not tag or merge unless the required local gate passes. Remote marketplace or Grok UI evidence is environment/manual and should be recorded separately when release scope requires it.
