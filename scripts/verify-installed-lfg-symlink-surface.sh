#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$REPO_ROOT"
scripts/install-lfg-symlink.sh >/tmp/lfg-symlink-install.out
for bin in "$HOME/.local/bin/lfg" "$HOME/.grok/bin/lfg"; do
  test -L "$bin"
  target="$(readlink "$bin")"
  test "$target" = "$REPO_ROOT/plugins/lfg/bin/lfg"
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
assert obj['status']=='ready', obj
assert obj['launcher']=='lfg', obj
assert obj['mode']=='lfg-runtime', obj
assert 'attachCommand' not in obj, obj
PY
  "$bin" --json slash '/team providers' >/tmp/lfg-installed-team-providers.json
  python3 - <<'PY'
import json
obj=json.load(open('/tmp/lfg-installed-team-providers.json'))
assert obj['ok'], obj
expected={'hermes','claude','codex','gemini','copilot','opencode','grok','subagent','noop'}
assert {p['provider'] for p in obj['providers']} == expected, obj
assert obj['smokeSafe'] == 'noop', obj
PY
  "$bin" --json slash '/team preflight' --name lfg-installed-preflight >/tmp/lfg-installed-team-preflight.json
  python3 - <<'PY'
import json
obj=json.load(open('/tmp/lfg-installed-team-preflight.json'))
assert obj['ok'], obj
assert obj['backend']['status']=='running', obj
assert obj['summary']['smokeSafe']=='noop', obj
assert obj['commands']['providers']=='lfg team providers', obj
assert obj['commands']['backendAttach'].startswith('tmux attach -t '), obj
assert '--providers noop' in obj['commands']['createNoopSmoke'], obj
PY
  tmux kill-session -t lfg-installed-preflight >/dev/null 2>&1 || true
done
for bin in "$HOME/.local/bin/ulw" "$HOME/.grok/bin/ulw"; do
  test -L "$bin"
  target="$(readlink "$bin")"
  test "$target" = "$REPO_ROOT/plugins/lfg/bin/ulw"
  "$bin" --json status >/tmp/ulw-installed-status.json
  python3 - <<'PY'
import json
obj=json.load(open('/tmp/ulw-installed-status.json'))
assert obj['ok'], obj
assert obj['version']=='0.3.0', obj
PY
  "$bin" --json >/tmp/ulw-installed-launch.json
  python3 - <<'PY'
import json
obj=json.load(open('/tmp/ulw-installed-launch.json'))
assert obj['status']=='ready', obj
assert obj['launcher']=='ulw', obj
assert obj['mode']=='lfg-runtime', obj
assert 'attachCommand' not in obj, obj
PY
done
for bin in "$HOME/.local/bin/lfg.py" "$HOME/.grok/bin/lfg.py"; do
  test -L "$bin"
  target="$(readlink "$bin")"
  test "$target" = "$REPO_ROOT/plugins/lfg/bin/lfg.py"
done
echo "lfg-installed-symlink-surface=ok runtime=lfg-runtime aliases=lfg,ulw slash=/team-providers,/team-preflight commands=ok"
