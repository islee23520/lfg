#!/usr/bin/env bash
set -euo pipefail
GROK_BIN="${GROK_BIN:-/Users/ilseoblee/.grok/bin/grok}"
test -x "$GROK_BIN"
# 1) Prove Grok's hook engine fires in this headless/tool-use path for global hooks.
BACKUP="$(mktemp -d)"
if [ -d "$HOME/.grok/hooks" ]; then cp -a "$HOME/.grok/hooks" "$BACKUP/hooks.bak"; fi
cleanup_global() {
  rm -rf "$HOME/.grok/hooks"
  if [ -d "$BACKUP/hooks.bak" ]; then mv "$BACKUP/hooks.bak" "$HOME/.grok/hooks"; fi
  rm -rf "$BACKUP"
}
trap cleanup_global EXIT
rm -rf "$HOME/.grok/hooks"
mkdir -p "$HOME/.grok/hooks" "$HOME/.grok/tmp-hook-data"
cat > "$HOME/.grok/hooks/lfg-global-hook-smoke.json" <<'JSON'
{"hooks":{"SessionStart":[{"hooks":[{"type":"command","command":"/Users/ilseoblee/.grok/hooks/lfg-global-hook-smoke.sh","timeout":5}]}],"UserPromptSubmit":[{"hooks":[{"type":"command","command":"/Users/ilseoblee/.grok/hooks/lfg-global-hook-smoke.sh","timeout":5}]}],"PreToolUse":[{"hooks":[{"type":"command","command":"/Users/ilseoblee/.grok/hooks/lfg-global-hook-smoke.sh","timeout":5}]}],"PostToolUse":[{"hooks":[{"type":"command","command":"/Users/ilseoblee/.grok/hooks/lfg-global-hook-smoke.sh","timeout":5}]}],"Stop":[{"hooks":[{"type":"command","command":"/Users/ilseoblee/.grok/hooks/lfg-global-hook-smoke.sh","timeout":5}]}]}}
JSON
cat > "$HOME/.grok/hooks/lfg-global-hook-smoke.sh" <<'SH'
#!/usr/bin/env bash
set +e
mkdir -p /Users/ilseoblee/.grok/tmp-hook-data
payload=$(cat 2>/dev/null)
printf '{"event":"%s","bytes":%s}\n' "${GROK_HOOK_EVENT:-unknown}" "${#payload}" >> /Users/ilseoblee/.grok/tmp-hook-data/lfg-global-hook-smoke.jsonl
exit 0
SH
chmod +x "$HOME/.grok/hooks/lfg-global-hook-smoke.sh"
rm -f "$HOME/.grok/tmp-hook-data/lfg-global-hook-smoke.jsonl"
"$GROK_BIN" --no-leader --cwd /tmp --no-alt-screen --always-approve --max-turns 12 --output-format json \
  -p 'Use the terminal tool to run: echo LFG_GLOBAL_HOOK_SESSION. Then answer exactly DONE.' \
  >/tmp/grok-global-hook-scope.json 2>/tmp/grok-global-hook-scope.err || true
python3 - <<'PY'
import json, pathlib
obj=json.loads(pathlib.Path('/tmp/grok-global-hook-scope.json').read_text())
assert obj.get('text','').strip().startswith('DONE'), obj
assert 'LFG_GLOBAL_HOOK_SESSION' in obj.get('thought',''), obj
PY
GLOBAL_LOG="$HOME/.grok/tmp-hook-data/lfg-global-hook-smoke.jsonl"
test -s "$GLOBAL_LOG"
GLOBAL_EVENTS="$(wc -l < "$GLOBAL_LOG" | tr -d ' ')"
echo "grok-global-hook-engine=ok events=$GLOBAL_EVENTS"
cleanup_global
trap - EXIT

# 2) In the same Grok version/path, plugin hooks are discovered and listed active,
# but plugin hook commands do not emit audit records in headless/tool-use mode.
plugins/grok-harnessing/bin/grok-install-smoke.sh >/tmp/grok-plugin-scope-install.log
INST="$HOME/.grok/plugins/grok-build/hooks/hooks.json"
cp "$INST" /tmp/grok-build-hooks.scope.backup.json
python3 - <<'PY'
import json, pathlib
p=pathlib.Path('/Users/ilseoblee/.grok/plugins/grok-build/hooks/hooks.json')
data=json.loads(p.read_text())
cmd='/Users/ilseoblee/.grok/plugins/grok-build/hooks/scripts/grok-build-audit-hook.sh'
for entries in data['hooks'].values():
    for entry in entries:
        for hook in entry['hooks']:
            hook['command']=cmd
p.write_text(json.dumps(data, indent=2)+"\n")
PY
rm -rf "$HOME/.grok/plugin-data/grok-build/events"
"$GROK_BIN" --no-leader --cwd /tmp --no-alt-screen --always-approve --max-turns 12 --output-format json \
  -p 'Use the terminal tool to run: echo LFG_PLUGIN_ABS_HOOK_SESSION. Then answer exactly DONE.' \
  >/tmp/grok-plugin-hook-scope.json 2>/tmp/grok-plugin-hook-scope.err || true
mv /tmp/grok-build-hooks.scope.backup.json "$INST"
python3 - <<'PY'
import json, pathlib
obj=json.loads(pathlib.Path('/tmp/grok-plugin-hook-scope.json').read_text())
assert obj.get('text','').strip().startswith('DONE'), obj
assert 'LFG_PLUGIN_ABS_HOOK_SESSION' in obj.get('thought',''), obj
PY
if [ -s "$HOME/.grok/plugin-data/grok-build/events/audit.jsonl" ]; then
  echo "grok-plugin-hook-scope=ok"
else
  echo "grok-plugin-hook-scope=not-observed while-global-hooks-ok"
fi
