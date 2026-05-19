#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$REPO_ROOT"

scripts/install-lfg-symlink.sh >/tmp/lfg-install-smoke.log
lfg --json >/tmp/lfg-launch.json
python3 - <<'PY'
import json
obj=json.load(open('/tmp/lfg-launch.json'))
assert obj['status'] == 'ready', obj
assert obj['launcher'] == 'lfg', obj
assert obj['mode'] == 'lfg-runtime', obj
assert 'attachCommand' not in obj, obj
print('lfg-launch-runtime=ok mode=%s' % obj['mode'])
PY
ulw --json >/tmp/ulw-launch.json
python3 - <<'PY'
import json
obj=json.load(open('/tmp/ulw-launch.json'))
assert obj['status'] == 'ready', obj
assert obj['launcher'] == 'ulw', obj
assert obj['mode'] == 'lfg-runtime', obj
assert 'attachCommand' not in obj, obj
print('ulw-launch-runtime=ok mode=%s' % obj['mode'])
PY
echo "lfg-launch-smoke=ok alias=ulw"
