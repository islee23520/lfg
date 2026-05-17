#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$REPO_ROOT"
GROK_BIN="${GROK_BIN:-/Users/ilseoblee/.grok/bin/grok}"
test -x "$GROK_BIN"
plugins/grok-harnessing/bin/grok-install-smoke.sh >/tmp/grok-plugins-surface-install.log
"$GROK_BIN" --cwd /tmp --no-alt-screen --max-turns 5 --output-format json -p '/plugins list' >/tmp/grok-plugins-list.json 2>/tmp/grok-plugins-list.err || true
python3 - <<'PY'
import json, pathlib
obj=json.loads(pathlib.Path('/tmp/grok-plugins-list.json').read_text())
text=obj.get('text','')
assert 'grok-build v0.3.0 (user)' in text, text
assert '28 skills, hooks: active, 1 MCP servers' in text, text
assert obj.get('sessionId'), obj
print('grok-plugins-list=ok sessionId=%s' % obj['sessionId'])
print('grok-plugins-surface=ok')
PY
