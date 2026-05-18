#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$REPO_ROOT"
TMP="$(mktemp -d)"
OUT="$TMP/stdout.jsonl"
ERR="$TMP/stderr.log"
trap 'rm -rf "$TMP"' EXIT

GROK_PLUGIN_DATA="$TMP/data" python3 plugins/lfg/bin/lfg-mcp.py >"$OUT" 2>"$ERR" <<'JSON'
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"grok_build_team","arguments":{"action":"status","team":"definitely-missing-team"}}}
{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"definitely_missing_tool","arguments":{}}}
not-json
JSON

python3 - <<'PY' "$OUT" "$ERR"
import json, pathlib, sys
out = pathlib.Path(sys.argv[1])
err = pathlib.Path(sys.argv[2])
err_text = err.read_text(encoding='utf-8')
assert err_text == '', err_text
lines = [line for line in out.read_text(encoding='utf-8').splitlines() if line.strip()]
assert len(lines) == 4, lines
msgs = [json.loads(line) for line in lines]
assert msgs[0]['result']['serverInfo']['name'] == 'lfg-harness', msgs[0]
assert any(t['name'] == 'grok_build_team' for t in msgs[1]['result']['tools']), msgs[1]
team_text = msgs[2]['result']['content'][0]['text']
team_payload = json.loads(team_text)
assert team_payload['returncode'] != 0, team_payload
assert 'team not found' in team_payload['stderr'], team_payload
assert 'error' in msgs[3], msgs[3]
print('mcp-stdout-jsonrpc=ok lines=%d' % len(lines))
print('mcp-stderr-isolated=ok')
PY

echo "mcp-stdio-isolation=ok"
