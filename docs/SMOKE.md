# Smoke verification

`lfg` is migrating to a TypeScript runtime. The active local smoke gate is the Bun self-test:

```sh
bun plugins/lfg/bin/self-test.ts
```

The self-test directly verifies, in order:

1. JSON manifests, `catalog/omo-skill-map.json`, plugin docs, and marketplace metadata.
2. Hook redaction through `plugins/lfg/hooks/scripts/lfg-audit-hook.sh`.
3. Bounded TODO continuation and hook bridge contracts through the TS smoke runner.
4. MCP stdio isolation and tool discovery from `bun plugins/lfg/bin/lfg-mcp.ts`.
5. State schema via `lfg --json doctor`.
6. Release notes/source docs and marketplace package identity.
7. Team dry-run planning with `noop` providers.
8. Real tmux team lifecycle: create, status, resume, shutdown.
9. Full Bun smoke matrix: `bun test plugins/lfg/src/runtime-ts plugins/lfg/src/mcp-ts plugins/lfg/src/hooks-ts plugins/lfg/src/smoke-ts plugins/lfg/test-utils`.

Expected evidence includes:

```text
manifest-and-file-checks=ok
marketplace-metadata=ok
release-notes=ok
marketplace-source=ok
hook-smoke=ok
hook-bridge-smoke=ok
todo-continuation=ok
continuation-gate=ok
mcp-smoke=ok
mcp-stdio-isolation=ok
mcp-stderr-isolated=ok
state-schema-versioning=ok
state-schema-doctor=ok
team-dry-run=ok
models-auth=ok
ultrawork-stop-conditions=ok
team-tmux-lifecycle=ok
runtime-smoke-coverage=100%
```

Additional marketplace install/discovery smoke is removed in TS cutover, manual Grok gate pending.

Expected evidence:

```text
grok-install-smoke=ok skills=<discovered-count> key_skills_present
grok-agent-discovery=ok agents=<discovered-count> key_agents_present
```

Latest observed local evidence: `grok-install-smoke=ok skills=27 key_skills_present` and `grok-agent-discovery=ok agents=10 key_agents_present`.

Real Grok named sub-agent spawning is a separate environment/manual gate. Run it only in an authenticated Grok Build environment where the host can spawn child agents and return their outputs:

```sh
grok --cwd "/var/folders/6r/g20fxk_s1ds24_h6lm971wt00000gn/T/opencode" \
  --output-format streaming-json \
  --max-turns 30 \
  --no-alt-screen \
  -p "T28 native subagent gate. Do not edit files. If your real subagent/task tool works, spawn two read-only child agents named researcher and critic in parallel. researcher output: one sentence explaining why generic Responses API calls are not native named sub-agent evidence. critic output: one sentence explaining why credentials presence is not native named sub-agent evidence. Then report child IDs, both outputs, and a one-sentence synthesis. If actual child spawn fails or IDs/outputs cannot be collected, output MANUAL_GATE_NOT_RUN with the failing prerequisite. Be concise; do not simulate child outputs."
```

Pass evidence must prove two named child spawns, two independent child outputs, and parent synthesis. If the transcript says `MANUAL_GATE_NOT_RUN`, says `MANUAL_GATE_FAILED`, or lacks child output collection, keep native spawn manual-gated and record skip/failure evidence instead of `grok-native-spawn-manual=ok`.

Latest local pass evidence is recorded in `docs/evidence/t28-grok-manual-gate-status.md` as `grok-native-spawn-manual=ok` using the Grok-discoverable LFG plugin agents `lfg:explore` and `lfg:oracle`.

Useful focused commands while debugging:

```sh
bun test plugins/lfg/src/runtime-ts plugins/lfg/src/mcp-ts plugins/lfg/src/hooks-ts plugins/lfg/src/smoke-ts plugins/lfg/test-utils
bun plugins/lfg/bin/self-test.ts
plugins/lfg/bin/lfg --json doctor
plugins/lfg/bin/lfg --json team create 3:executor "verify release" --providers noop --dry-run
plugins/lfg/bin/lfg --json slash '/team providers'
plugins/lfg/bin/lfg --json slash '/team preflight'
```

The user-facing setup skill/MCP surface is OMO-native. Use `setup`/`grok_build_setup` as the active surface; legacy `omx-setup` and `grok_build_omx_setup` are no longer accepted.
