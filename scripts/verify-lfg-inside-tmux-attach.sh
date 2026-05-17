#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$REPO_ROOT"
SESSION="lfg-inside-tmux-smoke-$$"
TMP_DATA="$(mktemp -d)"
CAPTURE="$(mktemp)"
cleanup() {
  tmux kill-session -t "$SESSION" 2>/dev/null || true
  rm -rf "$TMP_DATA" "$CAPTURE"
}
trap cleanup EXIT
tmux kill-session -t "$SESSION" 2>/dev/null || true
tmux new-session -d -s "$SESSION" -c "$REPO_ROOT" "GROK_PLUGIN_ROOT='$REPO_ROOT/plugins/grok-harnessing' GROK_PLUGIN_DATA='$TMP_DATA' '$REPO_ROOT/plugins/grok-harnessing/bin/lfg'; sleep 4"
tmux pipe-pane -t "$SESSION:0.0" -o "cat > '$CAPTURE'"
# Wait for lfg to return and split an attach pane.
for _ in $(seq 1 30); do
  panes="$(tmux list-panes -t "$SESSION" 2>/dev/null | wc -l | tr -d ' ')"
  if [ "${panes:-0}" -ge 2 ] && grep -q '"attachMethod": "split-window"' "$CAPTURE" 2>/dev/null; then
    break
  fi
  sleep 0.2
done
panes="$(tmux list-panes -t "$SESSION" | wc -l | tr -d ' ')"
test "$panes" -ge 2
python3 - <<'PY' "$CAPTURE" "$panes"
import json, pathlib, re, sys
text=pathlib.Path(sys.argv[1]).read_text(errors='ignore')
match=re.search(r'\{[\s\S]*"attachMethod"\s*:\s*"split-window"[\s\S]*?\n\}', text)
assert match, text
obj=json.loads(match.group(0))
assert obj['status']=='running', obj
assert obj['mode']=='tmux-backend', obj
assert obj['attached'] is True, obj
assert obj['attachMethod']=='split-window', obj
assert obj['triggerPane'].startswith('%'), obj
print('lfg-inside-tmux-attach=ok panes=%s triggerPane=%s' % (sys.argv[2] if len(sys.argv)>2 else 'unknown', obj['triggerPane']))
PY
