#!/usr/bin/env bash
set -euo pipefail
GROK_BIN="${GROK_BIN:-/Users/ilseoblee/.grok/bin/grok}"
test -x "$GROK_BIN"
if ! command -v expect >/dev/null; then
  echo "grok-tui-hook-session=skipped reason=expect-missing"
  exit 0
fi
rm -rf "$PWD/.lfg/events"
cat >/tmp/grok-tui-hook.expect <<'EXPECT'
set timeout 45
spawn /Users/ilseoblee/.grok/bin/grok --no-leader --cwd /tmp --no-alt-screen
expect {
  -re {❯|>} {}
  timeout {}
}
send "Use the terminal tool to run: echo LFG_TUI_HOOK_SESSION. Then answer exactly DONE.\r"
expect {
  -re {DONE|LFG_TUI_HOOK_SESSION|Running: echo LFG_TUI_HOOK_SESSION} {}
  timeout {}
}
send "\003"
expect eof
EXPECT
/usr/bin/expect -f /tmp/grok-tui-hook.expect >/tmp/grok-tui-hook.out 2>/tmp/grok-tui-hook.err || true
if grep -q 'LFG_TUI_HOOK_SESSION\|Running: echo LFG_TUI_HOOK_SESSION' /tmp/grok-tui-hook.out; then
  echo "grok-tui-hook-session=attempted"
else
  echo "grok-tui-hook-session=not-observed reason=tui-automation-timeout"
fi
LOG="$PWD/.lfg/events/audit.jsonl"
if [[ -s "$LOG" ]]; then
  echo "grok-tui-hook-emission=ok log=$LOG"
else
  echo "grok-tui-hook-emission=not-observed grok=0.1.211"
fi
