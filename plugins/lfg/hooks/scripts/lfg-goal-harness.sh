#!/usr/bin/env bash
# LFG Active Goal Harness — Aggressive Injection Wrapper
# This script is what actually gets registered in ~/.grok/hooks/
#
# It deliberately tries to do direct prompt injection by:
# 1. Calling the Python harness (which prints the injection block to stdout)
# 2. The stdout of this entire script is what the Grok hook engine sees for this event.
#
# Fail-open by design. If anything goes wrong, we exit 0 and stay silent.

set +euo pipefail

# Resolve plugin root (same logic as the old audit hook)
ROOT="${GROK_PLUGIN_ROOT:-${CLAUDE_PLUGIN_ROOT:-}}"
if [ -z "$ROOT" ]; then
  SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" 2>/dev/null && pwd)"
  ROOT="$(CDPATH= cd -- "${SCRIPT_DIR}/../.." 2>/dev/null && pwd)"
fi

# Data directory
DATA="${GROK_PLUGIN_DATA:-${CLAUDE_PLUGIN_DATA:-${PWD}/.lfg}}"

# Export so the Python harness can find state
export GROK_PLUGIN_DATA="$DATA"
export GROK_PLUGIN_ROOT="$ROOT"

# The real brain
HARNESS_PY="$ROOT/hooks/scripts/lfg-goal-harness.py"

if [ -x "$HARNESS_PY" ] || [ -f "$HARNESS_PY" ]; then
  # Run the Python harness.
  # Its stdout (the aggressive injection block) will be captured by the hook runner.
  python3 "$HARNESS_PY" 2>/dev/null || true
fi

# Always succeed (fail-open). We never want a broken harness to break the user's session.
exit 0
