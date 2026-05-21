# Release checklist

Use this checklist before merging or tagging `islee23520/lfg`.

## Required gates

- [x] Python syntax passes for runtime, MCP, and smoke tests.
- [x] Plugin self-test passes and emits `runtime-smoke-coverage=100%`.
- [x] Manifest/catalog/docs check emits `manifest-and-file-checks=ok`.
- [x] Marketplace metadata check emits `marketplace-metadata=ok` and still points to `islee23520/lfg`.
- [x] Release notes/source docs checks emit `release-notes=ok` and `marketplace-source=ok`.
- [x] MCP stdio check emits `mcp-stdio-isolation=ok` and `mcp-stderr-isolated=ok`.
- [x] Hook continuation check emits `todo-continuation=ok` and `continuation-gate=ok`, proving reminders require incomplete work plus new progress evidence and `/loop` writes a durable manual-gate artifact before dispatch.
- [x] State schema checks emit `state-schema-versioning=ok` and `state-schema-doctor=ok`.
- [x] Team checks emit `team-dry-run=ok`, `models-auth=ok`, and `team-tmux-lifecycle=ok`.
- [x] Ultrawork checks emit `ultrawork-stop-conditions=ok` and prove accepted/manual stop states require evidence artifacts before advancement.
- [x] Slash/MCP team surfaces still expose `/team providers`, `/team preflight`, and `grok_build_team.preflight` with valid JSON output.
- [x] Doctor diagnostics include `grok_marketplace` and `agents_marketplace`.
- [x] Real Grok install smoke emits `grok-install-smoke=ok skills=<discovered-count> key_skills_present` and `grok-agent-discovery=ok agents=<discovered-count> key_agents_present` when a Grok install is available.
- [x] Real Grok named sub-agent manual gate is recorded with `grok-native-spawn-manual=ok` evidence in `docs/evidence/t28-grok-manual-gate-status.md`.

## Commands

```sh
python3 -m py_compile plugins/lfg/bin/lfg.py plugins/lfg/bin/lfg-mcp.py plugins/lfg/bin/self-test.py plugins/lfg/bin/grok-install-smoke.py plugins/lfg/src/runtime/cli.py plugins/lfg/src/runtime/constants.py tests/smoke/test_grok_build_runtime.py
python3 plugins/lfg/bin/self-test.py
python3 -m ruff check .
python3 plugins/lfg/bin/grok-install-smoke.py
```

## Expected installed surface

The real Grok inspect smoke must discover the canonical key skills from the plugin. The total skill count is reported as the discovered count because Grok may include compatibility and bundled skill surfaces from the installed plugin:

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
