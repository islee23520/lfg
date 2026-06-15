#!/usr/bin/env bash
# Open a new tmux session and run the fast-tier → Grok install + inspect harness.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SESSION="${LFG_VERIFY_TMUX_SESSION:-lfg-fast-tier}"
cd "$ROOT"
npm run build --silent
tmux kill-session -t "$SESSION" 2>/dev/null || true
tmux new-session -d -s "$SESSION" -c "$ROOT" \
  "npm run build --silent && npx vitest run src/cli/fast-tier-grok-live.test.ts 2>&1 | tee /tmp/lfg-fast-tier-verify.log; echo '--- log: /tmp/lfg-fast-tier-verify.log ---'; echo 'Press q to close pane if attached'; read -r _"
tmux attach-session -t "$SESSION"