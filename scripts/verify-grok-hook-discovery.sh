#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$REPO_ROOT"
GROK_BIN="${GROK_BIN:-/Users/ilseoblee/.grok/bin/grok}"
test -x "$GROK_BIN"
plugins/grok-harnessing/bin/grok-install-smoke.sh >/tmp/grok-hook-install-smoke.log
"$GROK_BIN" --cwd /tmp inspect --json >/tmp/grok-hook-inspect.json
python3 - <<'PY'
import json, pathlib
obj=json.load(open('/tmp/grok-hook-inspect.json'))
hooks=obj.get('hooks', [])
targets=[h.get('target','') for h in hooks]
expected='/Users/ilseoblee/.grok/plugins/grok-build/hooks/hooks.json'
assert expected in targets, targets
installed=pathlib.Path(expected)
data=json.loads(installed.read_text())
for event, entries in data['hooks'].items():
    for entry in entries:
        for hook in entry['hooks']:
            assert hook['command'] == 'scripts/grok-build-audit-hook.sh', (event, hook)
print('grok-hook-discovery=ok hooks=%d' % len(hooks))
PY
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
printf '{"hookEventName":"UserPromptSubmit","prompt":"xai-SECRET ghp_SECRET"}' \
  | GROK_PLUGIN_ROOT="/Users/ilseoblee/.grok/plugins/grok-build" \
    GROK_PLUGIN_DATA="$TMP" \
    GROK_HOOK_EVENT="UserPromptSubmit" \
    /Users/ilseoblee/.grok/plugins/grok-build/hooks/scripts/grok-build-audit-hook.sh
LOG="$TMP/events/audit.jsonl"
test -s "$LOG"
if grep -E 'xai-SECRET|ghp_SECRET' "$LOG" >/dev/null; then
  echo 'hook-redaction=failed' >&2
  exit 1
fi
python3 - <<'PY' "$LOG"
import json, pathlib, sys
line=pathlib.Path(sys.argv[1]).read_text().splitlines()[-1]
obj=json.loads(line)
assert obj['event'] == 'UserPromptSubmit', obj
assert '[REDACTED]' in obj['payloadPreview'], obj
print('hook-event-replay=ok event=%s' % obj['event'])
PY
"$GROK_BIN" --cwd /tmp --no-alt-screen --max-turns 10 --output-format json -p 'Reply with exactly OK.' >/tmp/grok-hook-headless.json 2>/tmp/grok-hook-headless.err || true
python3 - <<'PY'
import json, pathlib
text=pathlib.Path('/tmp/grok-hook-headless.json').read_text()
obj=json.loads(text)
assert obj.get('text') == 'OK', obj
assert obj.get('sessionId'), obj
print('grok-headless-session=ok sessionId=%s' % obj['sessionId'])
PY
