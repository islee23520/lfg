#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$REPO_ROOT"
TMP="$(mktemp -d)"
TEAM="lfg-preflight-smoke-$$"
cleanup() { tmux kill-session -t "$TEAM" >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT
GROK_PLUGIN_DATA="$TMP" plugins/grok-harnessing/bin/lfg --json team preflight --name "$TEAM" >/tmp/team-preflight.json
python3 - <<'PY' "$TEAM"
import json, pathlib, sys
obj=json.loads(pathlib.Path('/tmp/team-preflight.json').read_text())
assert obj['ok'], obj
assert obj['tmux']['available'], obj
assert obj['backend']['status']=='running', obj
assert obj['backend']['name']==sys.argv[1], obj
assert obj['summary']['smokeSafe']=='noop', obj
assert 'noop' in obj['summary']['availableProviders'], obj
assert obj['commands']['providers']=='lfg team providers', obj
assert obj['commands']['backendAttach'].startswith('tmux attach -t '), obj
assert '--providers noop' in obj['commands']['createNoopSmoke'], obj
print('team-preflight-cli=ok backend=%s' % obj['backend']['name'])
print('team-preflight-commands=ok')
PY
GROK_PLUGIN_DATA="$TMP" plugins/grok-harnessing/bin/lfg --json slash '/team preflight' --name "$TEAM" >/tmp/team-preflight-slash.json
python3 - <<'PY'
import json, pathlib
obj=json.loads(pathlib.Path('/tmp/team-preflight-slash.json').read_text())
assert obj['ok'], obj
assert obj['backend']['status']=='running', obj
assert obj['commands']['providers']=='lfg team providers', obj
print('team-preflight-slash=ok')
PY
GROK_PLUGIN_DATA="$TMP" python3 plugins/grok-harnessing/bin/grok-build-mcp.py >/tmp/team-preflight-mcp.out 2>/tmp/team-preflight-mcp.err <<EOF
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"grok_build_team","arguments":{"action":"preflight","team":"$TEAM"}}}
EOF
python3 - <<'PY'
import json, pathlib
lines=[json.loads(x) for x in pathlib.Path('/tmp/team-preflight-mcp.out').read_text().splitlines() if x.strip()]
assert len(lines)==2, lines
payload=json.loads(lines[1]['result']['content'][0]['text'])
assert payload['returncode']==0, payload
assert '"ok": true' in payload['stdout'], payload
assert '"smokeSafe": "noop"' in payload['stdout'], payload
assert '"commands"' in payload['stdout'], payload
assert 'lfg team providers' in payload['stdout'], payload
assert pathlib.Path('/tmp/team-preflight-mcp.err').read_text() == ''
print('team-preflight-mcp=ok')
PY
