#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$REPO_ROOT"

scripts/install-lfg-symlink.sh >/tmp/lfg-install-smoke.log
lfg --json >/tmp/lfg-launch.json
python3 - <<'PY'
import json
obj=json.load(open('/tmp/lfg-launch.json'))
assert obj['status'] == 'running', obj
assert obj['launcher'] == 'lfg', obj
assert obj['mode'] == 'tmux-backend', obj
assert obj['attachCommand'].startswith('tmux attach -t '), obj
print('lfg-launch-json=ok attachCommand=%s' % obj['attachCommand'])
PY
ulw --json >/tmp/ulw-launch.json
python3 - <<'PY'
import json
obj=json.load(open('/tmp/ulw-launch.json'))
assert obj['status'] == 'running', obj
assert obj['launcher'] == 'ulw', obj
assert obj['mode'] == 'tmux-backend', obj
assert obj['attachCommand'].startswith('tmux attach -t '), obj
print('ulw-launch-json=ok attachCommand=%s' % obj['attachCommand'])
PY
SESSION="$(python3 - <<'PY'
import json
print(json.load(open('/tmp/lfg-launch.json'))['name'])
PY
)"
tmux has-session -t "$SESSION"
echo "lfg-tmux-session=ok $SESSION"
echo "lfg-launch-smoke=ok alias=ulw"
