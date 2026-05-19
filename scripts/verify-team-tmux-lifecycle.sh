#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$REPO_ROOT"
command -v tmux >/dev/null
TMP="$(mktemp -d)"
TEAM="lfg-team-smoke-$$"
cleanup() {
  tmux kill-session -t "$TEAM" >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT

CREATE_JSON="$(GROK_PLUGIN_DATA="$TMP" plugins/lfg/bin/lfg --json team create 2:executor "tmux lifecycle smoke" --name "$TEAM" --providers noop)"
CREATE_JSON="$CREATE_JSON" TEAM="$TEAM" python3 - <<'PY'
import json, os
obj=json.loads(os.environ['CREATE_JSON'])
assert obj['name'] == os.environ['TEAM'], obj
assert obj['status'] == 'running', obj
assert len(obj['members']) == 2, obj
assert {m['provider'] for m in obj['members']} == {'noop'}, obj
assert obj['commands']['attach'].startswith('tmux attach -t '), obj
print('team-create=ok name=%s members=%s' % (obj['name'], len(obj['members'])))
PY

tmux has-session -t "$TEAM"
STATUS_JSON="$(GROK_PLUGIN_DATA="$TMP" plugins/lfg/bin/lfg --json team status "$TEAM")"
STATUS_JSON="$STATUS_JSON" python3 - <<'PY'
import json, os
obj=json.loads(os.environ['STATUS_JSON'])
assert obj['status'] == 'running', obj
assert obj['tmux']['returncode'] == 0, obj
assert 'control' in obj['tmux']['stdout'], obj
print('team-status=ok windows=%s' % len(obj['tmux']['stdout'].splitlines()))
PY

RESUME_JSON="$(GROK_PLUGIN_DATA="$TMP" plugins/lfg/bin/lfg --json team resume "$TEAM")"
RESUME_JSON="$RESUME_JSON" python3 - <<'PY'
import json, os
obj=json.loads(os.environ['RESUME_JSON'])
assert obj['attachCommand'].startswith('tmux attach -t '), obj
assert obj['statusCommand'].startswith('tmux list-windows -t '), obj
print('team-resume=ok attachCommand=%s' % obj['attachCommand'])
PY

SHUTDOWN_JSON="$(GROK_PLUGIN_DATA="$TMP" plugins/lfg/bin/lfg --json team shutdown "$TEAM")"
SHUTDOWN_JSON="$SHUTDOWN_JSON" python3 - <<'PY'
import json, os
obj=json.loads(os.environ['SHUTDOWN_JSON'])
assert obj['status'] == 'shutdown', obj
assert obj['shutdown']['returncode'] == 0, obj
print('team-shutdown=ok')
PY

if tmux has-session -t "$TEAM" >/dev/null 2>&1; then
  echo "team-shutdown=failed session-still-running" >&2
  exit 1
fi

echo "team-tmux-lifecycle=ok"
