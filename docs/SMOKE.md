# Smoke verification

`lfg` is a Python-first plugin runtime. The local smoke gate is the plugin self-test:

```sh
python3 plugins/lfg/bin/self-test.py
```

The self-test directly verifies, in order:

1. JSON manifests, `catalog/omo-skill-map.json`, plugin docs, and marketplace metadata.
2. Hook redaction through `plugins/lfg/hooks/scripts/lfg-audit-hook.sh`.
3. Bounded TODO continuation and hook bridge contracts through `python3 -m pytest tests/smoke/test_hook_bridge_pytest.py -q`.
4. MCP stdio isolation and tool discovery from `plugins/lfg/bin/lfg-mcp.py`.
5. State schema via `lfg --json doctor`.
6. Release notes/source docs and marketplace package identity.
7. Team dry-run planning with `noop` providers.
8. Real tmux team lifecycle: create, status, resume, shutdown.
9. Full Python smoke matrix: `python3 -m unittest tests.smoke.test_grok_build_runtime -v`.

Expected evidence includes:

```text
manifest-and-file-checks=ok
marketplace-metadata=ok
release-notes=ok
marketplace-source=ok
hook-smoke=ok
hook-bridge-pytest=ok
todo-continuation=ok
ruff-check=ok
mcp-smoke=ok
mcp-stdio-isolation=ok
mcp-stderr-isolated=ok
state-schema-versioning=ok
state-schema-doctor=ok
team-dry-run=ok
models-auth=ok
team-tmux-lifecycle=ok
runtime-smoke-coverage=100%
```

Additional marketplace install/discovery smoke remains available when a real Grok install is present:

```sh
python3 plugins/lfg/bin/grok-install-smoke.py
```

Expected evidence:

```text
grok-install-smoke=ok skills=21 key_skills_present
```

Real Grok named sub-agent spawning is a separate environment/manual gate. Run it only in an authenticated Grok Build environment where the host can spawn child agents and return their outputs:

```sh
grok --cwd "/var/folders/6r/g20fxk_s1ds24_h6lm971wt00000gn/T/opencode" \
  --output-format streaming-json \
  --max-turns 30 \
  --no-alt-screen \
  -p "T28 native subagent gate. Do not edit files. If your real subagent/task tool works, spawn two read-only child agents named researcher and critic in parallel. researcher output: one sentence explaining why generic Responses API calls are not native named sub-agent evidence. critic output: one sentence explaining why credentials presence is not native named sub-agent evidence. Then report child IDs, both outputs, and a one-sentence synthesis. If actual child spawn fails or IDs/outputs cannot be collected, output MANUAL_GATE_NOT_RUN with the failing prerequisite. Be concise; do not simulate child outputs."
```

Pass evidence must prove two named child spawns, two independent child outputs, and parent synthesis. If the transcript says `MANUAL_GATE_NOT_RUN` or lacks child output collection, keep native spawn manual-gated and record skip evidence instead of `grok-native-spawn-manual=ok`.

Useful focused commands while debugging:

```sh
python3 -m py_compile plugins/lfg/bin/lfg.py plugins/lfg/bin/lfg-mcp.py plugins/lfg/bin/self-test.py plugins/lfg/bin/grok-install-smoke.py plugins/lfg/src/runtime/cli.py tests/smoke/test_grok_build_runtime.py
plugins/lfg/bin/lfg --json doctor
plugins/lfg/bin/lfg --json team create 3:executor "verify release" --providers noop --dry-run
plugins/lfg/bin/lfg --json slash '/team providers'
plugins/lfg/bin/lfg --json slash '/team preflight'
```

The user-facing setup skill/MCP surface is OMO-native. Legacy `omx-setup` CLI and `grok_build_omx_setup` calls remain accepted only as compatibility aliases until the coordinated runtime alias removal gate.
