#!/usr/bin/env bash
# Router: delegates to src/hooks/audit_hook.sh (the real implementation).
set +euo pipefail

ROOT="${GROK_PLUGIN_ROOT:-${CLAUDE_PLUGIN_ROOT:-}}"
if [ -z "$ROOT" ]; then
  SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" 2>/dev/null && pwd)"
  ROOT="$(CDPATH= cd -- "${SCRIPT_DIR}/../.." 2>/dev/null && pwd)"
fi

TARGET="$ROOT/src/hooks/audit_hook.sh"
if [ -f "$TARGET" ]; then
  exec "$TARGET"
fi
exit 0
