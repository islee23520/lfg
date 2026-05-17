#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$REPO_ROOT"
GROK_BIN="${GROK_BIN:-/Users/ilseoblee/.grok/bin/grok}"
test -x "$GROK_BIN"
plugins/grok-harnessing/bin/grok-install-smoke.sh >/tmp/grok-global-bridge-install.log
BACKUP="$(mktemp -d)"
if [ -d "$HOME/.grok/hooks" ]; then cp -a "$HOME/.grok/hooks" "$BACKUP/hooks.bak"; fi
cleanup() {
  rm -rf "$HOME/.grok/hooks"
  if [ -d "$BACKUP/hooks.bak" ]; then mv "$BACKUP/hooks.bak" "$HOME/.grok/hooks"; fi
  rm -rf "$BACKUP"
}
trap cleanup EXIT
rm -rf "$HOME/.grok/hooks" "$HOME/.grok/plugin-data/grok-build/events"
scripts/install-grok-build-global-hook-bridge.sh >/tmp/grok-global-bridge-install.out
"$GROK_BIN" --no-leader --cwd /tmp --no-alt-screen --always-approve --max-turns 12 --output-format json \
  -p 'Use the terminal tool to run: echo LFG_GLOBAL_BRIDGE_HOOK_SESSION. Then answer exactly DONE.' \
  >/tmp/grok-global-bridge-session.json 2>/tmp/grok-global-bridge-session.err || true
python3 - <<'PY'
import json, pathlib
obj=json.loads(pathlib.Path('/tmp/grok-global-bridge-session.json').read_text())
assert obj.get('text','').strip().startswith('DONE'), obj
assert 'LFG_GLOBAL_BRIDGE_HOOK_SESSION' in obj.get('thought',''), obj
PY
LOG="$HOME/.grok/plugin-data/grok-build/events/audit.jsonl"
test -s "$LOG"
python3 - <<'PY' "$LOG"
import json, pathlib, sys
lines=[json.loads(x) for x in pathlib.Path(sys.argv[1]).read_text().splitlines() if x.strip()]
events={x.get('event') for x in lines}
assert {'session_start','user_prompt_submit','pre_tool_use','post_tool_use','stop'} & events, events
assert all('LFG_GLOBAL_BRIDGE_HOOK_SESSION' not in x.get('payloadPreview','') or x.get('payloadBytes',0) > 0 for x in lines)
print('grok-global-hook-bridge=ok events=%s' % len(lines))
PY
