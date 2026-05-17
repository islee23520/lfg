#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$REPO_ROOT"
scripts/install-lfg-symlink.sh >/tmp/lfg-symlink-install.out
for bin in "$HOME/.local/bin/lfg" "$HOME/.grok/bin/lfg"; do
  test -L "$bin"
  target="$(readlink "$bin")"
  test "$target" = "$REPO_ROOT/plugins/grok-harnessing/bin/lfg"
  "$bin" --json status >/tmp/lfg-installed-status.json
  python3 - <<'PY'
import json
obj=json.load(open('/tmp/lfg-installed-status.json'))
assert obj['ok'], obj
assert obj['version']=='0.3.0', obj
assert obj['repo']['head'], obj
PY
  "$bin" --json >/tmp/lfg-installed-launch.json
  python3 - <<'PY'
import json
obj=json.load(open('/tmp/lfg-installed-launch.json'))
assert obj['status']=='running', obj
assert obj['launcher']=='lfg', obj
assert obj['mode']=='tmux-backend', obj
assert obj['attachCommand'].startswith('tmux attach -t '), obj
PY
  "$bin" --json slash '/team providers' >/tmp/lfg-installed-team-providers.json
  python3 - <<'PY'
import json
obj=json.load(open('/tmp/lfg-installed-team-providers.json'))
assert obj['ok'], obj
assert [p['provider'] for p in obj['providers']] == ['hermes','claude','codex','noop'], obj
assert obj['smokeSafe'] == 'noop', obj
PY
  "$bin" --json slash '/team preflight' --name lfg-installed-preflight >/tmp/lfg-installed-team-preflight.json
  python3 - <<'PY'
import json
obj=json.load(open('/tmp/lfg-installed-team-preflight.json'))
assert obj['ok'], obj
assert obj['backend']['status']=='running', obj
assert obj['summary']['smokeSafe']=='noop', obj
PY
  tmux kill-session -t lfg-installed-preflight >/dev/null 2>&1 || true
done
for bin in "$HOME/.local/bin/grok-build.py" "$HOME/.grok/bin/grok-build.py"; do
  test -L "$bin"
  target="$(readlink "$bin")"
  test "$target" = "$REPO_ROOT/plugins/grok-harnessing/bin/grok-build.py"
done
if tmux has-session -t lfg-backend 2>/dev/null; then
  echo "lfg-installed-symlink-surface=ok backend=lfg-backend slash=/team-providers,/team-preflight"
else
  echo "lfg-installed-symlink-surface=missing-backend" >&2
  exit 1
fi
