#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
SRC_DIR="$REPO_ROOT/plugins/lfg/bin"
TARGET_DIRS=("${LFG_BIN_DIR:-$HOME/.local/bin}" "$HOME/.grok/bin")

chmod +x "$SRC_DIR/lfg" "$SRC_DIR/ulw" "$SRC_DIR/lfg.py"
for dir in "${TARGET_DIRS[@]}"; do
  mkdir -p "$dir"
  ln -sfn "$SRC_DIR/lfg" "$dir/lfg"
  ln -sfn "$SRC_DIR/ulw" "$dir/ulw"
  ln -sfn "$SRC_DIR/lfg.py" "$dir/lfg.py"
  echo "lfg-symlink=$dir/lfg -> $(readlink "$dir/lfg")"
  echo "ulw-symlink=$dir/ulw -> $(readlink "$dir/ulw")"
  echo "lfg-symlink=$dir/lfg.py -> $(readlink "$dir/lfg.py")"
done

if ! command -v lfg >/dev/null 2>&1; then
  echo "lfg not found on PATH after symlink; add ${TARGET_DIRS[0]} to PATH" >&2
  exit 1
fi
lfg --json >/tmp/lfg-launch.json
python3 - <<'PY'
import json
obj=json.load(open('/tmp/lfg-launch.json'))
assert obj['status'] == 'running', obj
assert obj['launcher'] == 'lfg', obj
assert obj['mode'] == 'tmux-backend', obj
print('lfg-launch=ok attachCommand=%s' % obj['attachCommand'])
PY
lfg --json status >/tmp/lfg-status.json
python3 - <<'PY'
import json
obj=json.load(open('/tmp/lfg-status.json'))
assert obj['ok'], obj
assert obj['version'] == '0.3.0', obj
print('lfg-status=ok version=%s' % obj['version'])
PY
lfg --json doctor >/tmp/lfg-doctor.json
python3 - <<'PY'
import json
obj=json.load(open('/tmp/lfg-doctor.json'))
assert obj['ok'], obj
names={c['name'] for c in obj['checks']}
for required in ['grok_manifest','mcp_config','catalog','skills','grok_marketplace','agents_marketplace','exe:tmux','plugin_data','state_schema']:
    assert required in names, required
print('lfg-doctor=ok checks=%d warnings=%d' % (len(obj['checks']), len(obj.get('warnings', []))))
PY
ulw --json status >/tmp/ulw-status.json
python3 - <<'PY'
import json
obj=json.load(open('/tmp/ulw-status.json'))
assert obj['ok'], obj
assert obj['version'] == '0.3.0', obj
print('ulw-status=ok version=%s' % obj['version'])
PY
