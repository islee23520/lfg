#!/usr/bin/env bash
set -euo pipefail
GROK_BIN="${GROK_BIN:-/Users/ilseoblee/.grok/bin/grok}"
test -x "$GROK_BIN"
"$GROK_BIN" --no-leader --cwd /tmp --no-alt-screen --max-turns 20 --output-format json -p '/hooks-list' \
  >/tmp/grok-hooks-list-limit.json 2>/tmp/grok-hooks-list-limit.err || true
python3 - <<'PY'
import json, pathlib
out=pathlib.Path('/tmp/grok-hooks-list-limit.json').read_text()
err=pathlib.Path('/tmp/grok-hooks-list-limit.err').read_text()
obj=json.loads(out)
assert obj.get('type') == 'error', obj
assert 'max_turns exceeded' in obj.get('message',''), obj
assert '.grok/hooks' in err or 'max_turns exceeded' in err, err[-2000:]
print('grok-hooks-list-headless=not-observed reason=max_turns-exceeded')
PY
