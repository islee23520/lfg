#!/usr/bin/env bash
set -euo pipefail
PLUGIN_ROOT="${LFG_PLUGIN_ROOT:-$HOME/.grok/plugins/lfg}"
HOOK_DIR="$HOME/.grok/hooks"
mkdir -p "$HOOK_DIR"

# Make sure the aggressive harness exists
test -f "$PLUGIN_ROOT/hooks/scripts/lfg-goal-harness.py" || echo "WARNING: lfg-goal-harness.py not found, aggressive injection will be weak"
test -f "$PLUGIN_ROOT/hooks/scripts/lfg-goal-harness.sh" || echo "WARNING: lfg-goal-harness.sh not found"

# Copy the aggressive harness and the audit into ~/.grok/hooks/
cp -f "$PLUGIN_ROOT/hooks/scripts/lfg-goal-harness.sh" "$HOOK_DIR/lfg-goal-harness.sh" 2>/dev/null || true
cp -f "$PLUGIN_ROOT/hooks/scripts/lfg-goal-harness.py" "$HOOK_DIR/lfg-goal-harness.py" 2>/dev/null || true
chmod +x "$HOOK_DIR/lfg-goal-harness.sh" 2>/dev/null || true

# Also keep the old audit for logs
cp -f "$PLUGIN_ROOT/hooks/scripts/lfg-audit-hook.sh" "$HOOK_DIR/lfg-audit-hook.sh" 2>/dev/null || true
chmod +x "$HOOK_DIR/lfg-audit-hook.sh" 2>/dev/null || true

# Primary bridge JSON — UserPromptSubmit, Stop, PostToolUse now use the AGGRESSIVE harness
cat > "$HOOK_DIR/lfg-audit-bridge.json" <<JSON
{
  "hooks": {
    "SessionStart": [{"hooks": [{"type": "command", "command": "$HOOK_DIR/lfg-audit-bridge.sh", "timeout": 5}]}],
    "UserPromptSubmit": [{"hooks": [{"type": "command", "command": "$HOOK_DIR/lfg-goal-harness.sh", "timeout": 10}]}],
    "PreToolUse": [{"hooks": [{"type": "command", "command": "$HOOK_DIR/lfg-audit-bridge.sh", "timeout": 5}]}],
    "PostToolUse": [{"hooks": [{"type": "command", "command": "$HOOK_DIR/lfg-goal-harness.sh", "timeout": 10}]}],
    "PostToolUseFailure": [{"hooks": [{"type": "command", "command": "$HOOK_DIR/lfg-audit-bridge.sh", "timeout": 5}]}],
    "PreCompact": [{"hooks": [{"type": "command", "command": "$HOOK_DIR/lfg-goal-harness.sh", "timeout": 12}]}],
    "Stop": [{"hooks": [{"type": "command", "command": "$HOOK_DIR/lfg-goal-harness.sh", "timeout": 10}]}],
    "SessionEnd": [{"hooks": [{"type": "command", "command": "$HOOK_DIR/lfg-audit-bridge.sh", "timeout": 5}]}],
    "Notification": [{"hooks": [{"type": "command", "command": "$HOOK_DIR/lfg-audit-bridge.sh", "timeout": 5}]}]
  }
}
JSON

# The audit bridge shim (still used for non-critical events + logging)
cat > "$HOOK_DIR/lfg-audit-bridge.sh" <<SH
#!/usr/bin/env bash
set +euo pipefail
export GROK_PLUGIN_ROOT="$PLUGIN_ROOT"
export GROK_PLUGIN_DATA="\${GROK_PLUGIN_DATA:-$PWD/.lfg}"
# Run audit for logging, then try aggressive harness (best effort)
"$PLUGIN_ROOT/hooks/scripts/lfg-audit-hook.sh" "$@" 2>/dev/null || true
# For UserPromptSubmit / Stop / PostToolUse the JSON already points directly to lfg-goal-harness.sh
SH
chmod +x "$HOOK_DIR/lfg-audit-bridge.sh"

echo "lfg-global-hook-bridge=installed-with-aggressive-harness hookDir=$HOOK_DIR pluginRoot=$PLUGIN_ROOT"
echo "Critical events (UserPromptSubmit, Stop, PostToolUse) now route through lfg-goal-harness.sh for direct prompt injection."
