#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$REPO_ROOT"
TMP="$(mktemp -d)"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT
GROK_PLUGIN_DATA="$TMP" plugins/grok-harnessing/bin/lfg --json team create 4:executor "provider command smoke" --providers hermes,claude,codex,noop --dry-run >/tmp/team-provider-smoke.json
python3 - <<'PY'
import json, pathlib
obj=json.loads(pathlib.Path('/tmp/team-provider-smoke.json').read_text())
assert obj['status']=='planned', obj
providers=[m['provider'] for m in obj['members']]
assert providers == ['hermes','claude','codex','noop'], providers
commands={m['provider']: m['command'] for m in obj['members']}
assert commands['hermes'].startswith('hermes -z '), commands
assert commands['claude'].startswith('claude --permission-mode bypassPermissions '), commands
assert commands['codex'].startswith('codex '), commands
assert 'noop provider ready' in commands['noop'], commands
print('team-provider-commands=ok providers=%s' % ','.join(providers))
PY
GROK_PLUGIN_DATA="$TMP" plugins/grok-harnessing/bin/lfg --json doctor >/tmp/team-provider-doctor.json
python3 - <<'PY'
import json, pathlib
obj=json.loads(pathlib.Path('/tmp/team-provider-doctor.json').read_text())
checks={c['name']: c for c in obj['checks']}
assert 'team_provider_commands' in checks, checks.keys()
assert checks['team_provider_commands']['ok'], checks['team_provider_commands']
assert 'noop' in checks['team_provider_commands']['evidence'], checks['team_provider_commands']
print('team-provider-doctor=ok')
PY
