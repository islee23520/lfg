# Smoke verification

`lfg` is a Python-first plugin runtime. The local smoke gate is the plugin self-test:

```sh
plugins/lfg/bin/self-test.sh
```

The self-test directly verifies, in order:

1. JSON manifests, `catalog/omo-skill-map.json`, plugin docs, and marketplace metadata.
2. Hook redaction through `plugins/lfg/hooks/scripts/lfg-audit-hook.sh`.
3. MCP stdio isolation and tool discovery from `plugins/lfg/bin/lfg-mcp.py`.
4. State schema via `lfg --json doctor`.
5. Release notes/source docs and marketplace package identity.
6. Team dry-run planning with `noop` providers.
7. Real tmux team lifecycle: create, status, resume, shutdown.
8. Full Python smoke matrix: `python3 -m unittest tests.smoke.test_grok_build_runtime -v`.

Expected evidence includes:

```text
manifest-and-file-checks=ok
marketplace-metadata=ok
hook-smoke=ok
mcp-smoke=ok
mcp-stdio-isolation=ok
mcp-stderr-isolated=ok
state-schema-versioning=ok
state-schema-doctor=ok
release-notes=ok
marketplace-source=ok
ruff-check=ok
team-dry-run=ok
team-tmux-lifecycle=ok
runtime-smoke-coverage=100%
```

Additional marketplace install/discovery smoke remains available when a real Grok install is present:

```sh
plugins/lfg/bin/grok-install-smoke.sh
```

Expected evidence:

```text
grok-install-smoke=ok skills=28 key_skills_present
```

Useful focused commands while debugging:

```sh
python3 -m py_compile plugins/lfg/bin/lfg.py plugins/lfg/bin/lfg-mcp.py tests/smoke/test_grok_build_runtime.py
plugins/lfg/bin/lfg --json doctor
plugins/lfg/bin/lfg --json team create 3:executor "verify release" --providers noop --dry-run
plugins/lfg/bin/lfg --json slash '/team providers'
plugins/lfg/bin/lfg --json slash '/team preflight'
```

The user-facing `omx-setup` command/skill/MCP compatibility surface remains intentionally preserved while the catalog filename is OMO-native.
