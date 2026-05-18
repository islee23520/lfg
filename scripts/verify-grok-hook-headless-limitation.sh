#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$REPO_ROOT"
GROK_BIN="${GROK_BIN:-/Users/ilseoblee/.grok/bin/grok}"
test -x "$GROK_BIN"
plugins/lfg/bin/grok-install-smoke.sh >/tmp/grok-hook-limitation-install.log
rm -rf "$PWD/.lfg/events"
"$GROK_BIN" --no-leader --cwd /tmp --no-alt-screen --always-approve --max-turns 12 --output-format json \
  -p 'Use the terminal tool to run: echo LFG_HOOK_REAL_SESSION. Then answer exactly DONE.' \
  >/tmp/grok-hook-real-session.json 2>/tmp/grok-hook-real-session.err || true
python3 - <<'PY'
import json, pathlib
obj=json.loads(pathlib.Path('/tmp/grok-hook-real-session.json').read_text())
assert obj.get('text','').strip().startswith('DONE'), obj
assert obj.get('sessionId'), obj
thought=obj.get('thought','')
assert 'LFG_HOOK_REAL_SESSION' in thought, obj
print('grok-real-tool-session=ok sessionId=%s' % obj['sessionId'])
PY
LOG="$PWD/.lfg/events/audit.jsonl"
if [[ -s "$LOG" ]]; then
  echo "grok-headless-hook-emission=ok log=$LOG"
else
  echo "grok-headless-hook-emission=not-observed grok=0.1.211"
fi
