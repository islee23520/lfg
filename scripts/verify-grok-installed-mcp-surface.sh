#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$REPO_ROOT"
DEST="${GROK_BUILD_PLUGIN_DEST:-$HOME/.grok/plugins/grok-build}"
plugins/grok-harnessing/bin/grok-install-smoke.sh >/tmp/grok-installed-mcp-install.out
MCP="$DEST/bin/grok-build-mcp.py"
test -f "$MCP"
TMP_HOME="$(mktemp -d)"
TMP_DATA="$(mktemp -d)"
cleanup() { rm -rf "$TMP_HOME" "$TMP_DATA"; }
trap cleanup EXIT
GROK_PLUGIN_ROOT="$DEST" GROK_PLUGIN_DATA="$TMP_DATA" HOME="$TMP_HOME" python3 "$MCP" > /tmp/grok-installed-mcp.out 2>/tmp/grok-installed-mcp.err <<'EOF'
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"grok_build_hook_bridge","arguments":{"action":"status"}}}
{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"grok_build_runtime","arguments":{"action":"hook_bridge_status"}}}
{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"grok_build_team","arguments":{"action":"providers"}}}
EOF
python3 - <<'PY'
import json, pathlib
lines=[json.loads(x) for x in pathlib.Path('/tmp/grok-installed-mcp.out').read_text().splitlines() if x.strip()]
assert len(lines)==5, lines
assert lines[0]['result']['serverInfo']['version']=='0.3.0', lines[0]
tools={t['name'] for t in lines[1]['result']['tools']}
assert 'grok_build_hook_bridge' in tools, sorted(tools)
assert 'grok_build_team' in tools, sorted(tools)
for idx in (2,3):
    payload=json.loads(lines[idx]['result']['content'][0]['text'])
    assert payload['returncode']==0, payload
    assert '"ok": true' in payload['stdout'], payload
    assert '"installed": false' in payload['stdout'], payload
err=pathlib.Path('/tmp/grok-installed-mcp.err').read_text()
assert err == '', err
team_payload=json.loads(lines[4]['result']['content'][0]['text'])
assert team_payload['returncode']==0, team_payload
assert '"smokeSafe": "noop"' in team_payload['stdout'], team_payload
assert 'hermes' in team_payload['stdout'] and 'claude' in team_payload['stdout'] and 'codex' in team_payload['stdout'], team_payload
print('grok-installed-mcp-surface=ok tools=grok_build_hook_bridge,grok_build_team.providers')
PY
