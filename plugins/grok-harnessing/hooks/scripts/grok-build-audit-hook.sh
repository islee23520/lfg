#!/usr/bin/env bash
# Passive Grok Build plugin audit hook. Fail-open by design.
set +euo pipefail

ROOT="${GROK_PLUGIN_ROOT:-${CLAUDE_PLUGIN_ROOT:-}}"
if [ -z "$ROOT" ]; then
  SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" 2>/dev/null && pwd)"
  ROOT="$(CDPATH= cd -- "${SCRIPT_DIR}/../.." 2>/dev/null && pwd)"
fi
DATA="${GROK_PLUGIN_DATA:-${CLAUDE_PLUGIN_DATA:-${HOME}/.grok/plugin-data/grok-build}}"
LOG_DIR="${DATA}/events"
mkdir -p "$LOG_DIR" 2>/dev/null || exit 0
LOG_FILE="${LOG_DIR}/audit.jsonl"

redact() {
  sed -E 's/(xai-|sk-|gh[pousr]_|github_pat_)[A-Za-z0-9_\-]+/[REDACTED]/g'
}

PAYLOAD="$(cat 2>/dev/null | redact)"
export PAYLOAD
EVENT="${GROK_HOOK_EVENT:-${CLAUDE_HOOK_EVENT:-unknown}}"
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date)"
python3 - "$LOG_FILE" "$TS" "$EVENT" "$ROOT" <<'PY' >/dev/null 2>&1
import json, os, sys
log, ts, event, root = sys.argv[1:5]
payload = os.environ.get("PAYLOAD", "")[:20000]
record = {"ts": ts, "event": event, "pluginRoot": root, "payloadPreview": payload[:1000], "payloadBytes": len(payload)}
with open(log, "a", encoding="utf-8") as f:
    f.write(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n")
PY
exit 0
