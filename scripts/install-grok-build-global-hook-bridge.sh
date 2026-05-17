#!/usr/bin/env bash
set -euo pipefail
PLUGIN_ROOT="${GROK_BUILD_PLUGIN_ROOT:-$HOME/.grok/plugins/grok-build}"
HOOK_DIR="$HOME/.grok/hooks"
mkdir -p "$HOOK_DIR"
test -x "$PLUGIN_ROOT/hooks/scripts/grok-build-audit-hook.sh"
cat > "$HOOK_DIR/grok-build-audit-bridge.json" <<JSON
{
  "hooks": {
    "SessionStart": [{"hooks": [{"type": "command", "command": "$HOOK_DIR/grok-build-audit-bridge.sh", "timeout": 5}]}],
    "UserPromptSubmit": [{"hooks": [{"type": "command", "command": "$HOOK_DIR/grok-build-audit-bridge.sh", "timeout": 5}]}],
    "PreToolUse": [{"hooks": [{"type": "command", "command": "$HOOK_DIR/grok-build-audit-bridge.sh", "timeout": 5}]}],
    "PostToolUse": [{"hooks": [{"type": "command", "command": "$HOOK_DIR/grok-build-audit-bridge.sh", "timeout": 5}]}],
    "PostToolUseFailure": [{"hooks": [{"type": "command", "command": "$HOOK_DIR/grok-build-audit-bridge.sh", "timeout": 5}]}],
    "PreCompact": [{"hooks": [{"type": "command", "command": "$HOOK_DIR/grok-build-audit-bridge.sh", "timeout": 5}]}],
    "Stop": [{"hooks": [{"type": "command", "command": "$HOOK_DIR/grok-build-audit-bridge.sh", "timeout": 5}]}],
    "SessionEnd": [{"hooks": [{"type": "command", "command": "$HOOK_DIR/grok-build-audit-bridge.sh", "timeout": 5}]}],
    "Notification": [{"hooks": [{"type": "command", "command": "$HOOK_DIR/grok-build-audit-bridge.sh", "timeout": 5}]}]
  }
}
JSON
cat > "$HOOK_DIR/grok-build-audit-bridge.sh" <<SH
#!/usr/bin/env bash
set +euo pipefail
export GROK_PLUGIN_ROOT="$PLUGIN_ROOT"
export GROK_PLUGIN_DATA="\${GROK_PLUGIN_DATA:-$HOME/.grok/plugin-data/grok-build}"
exec "$PLUGIN_ROOT/hooks/scripts/grok-build-audit-hook.sh"
SH
chmod +x "$HOOK_DIR/grok-build-audit-bridge.sh"
echo "grok-build-global-hook-bridge=installed hookDir=$HOOK_DIR pluginRoot=$PLUGIN_ROOT"
