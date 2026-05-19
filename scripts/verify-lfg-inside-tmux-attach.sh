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
tmux new-session -d -s "$SESSION" -c "$REPO_ROOT"
tmux pipe-pane -t "$SESSION:0.0" -o "cat > '$CAPTURE'"
tmux send-keys -t "$SESSION:0.0" "GROK_PLUGIN_ROOT='$REPO_ROOT/plugins/lfg' GROK_PLUGIN_DATA='$TMP_DATA' '$REPO_ROOT/plugins/lfg/bin/lfg' --json" Enter
# Wait for lfg to return runtime status without opening an attach pane.
for _ in $(seq 1 30); do
  panes="$(tmux list-panes -t "$SESSION" 2>/dev/null | wc -l | tr -d ' ')"
  if [ "${panes:-0}" -eq 1 ] && grep -q '"mode": "lfg-runtime"' "$CAPTURE" 2>/dev/null; then
    break
  fi
  sleep 0.2
done
panes="$(tmux list-panes -t "$SESSION" | wc -l | tr -d ' ')"
test "$panes" -eq 1
python3 - <<'PY' "$CAPTURE" "$panes"
import json, pathlib, re, sys
text=pathlib.Path(sys.argv[1]).read_text(errors='ignore')
match=re.search(r'\{[\s\S]*"mode"\s*:\s*"lfg-runtime"[\s\S]*?\n\}', text)
assert match, text
obj=json.loads(match.group(0))
assert obj['status']=='ready', obj
assert obj['mode']=='lfg-runtime', obj
assert 'attachCommand' not in obj, obj
print('lfg-inside-tmux-status=ok panes=%s mode=%s' % (sys.argv[2] if len(sys.argv)>2 else 'unknown', obj['mode']))
PY
