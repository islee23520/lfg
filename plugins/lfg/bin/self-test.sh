#!/usr/bin/env bash
set -euo pipefail

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
REPO="$(CDPATH= cd -- "$ROOT/../.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

python3 - "$ROOT" "$REPO" <<'PY'
import json, pathlib, sys
root = pathlib.Path(sys.argv[1])
repo = pathlib.Path(sys.argv[2])

for rel in [
    ".grok-plugin/plugin.json",
    ".claude-plugin/plugin.json",
    "hooks/hooks.json",
    ".mcp.json",
    ".lsp.json",
    "catalog/omo-skill-map.json",
]:
    json.loads((root / rel).read_text())

for rel in [
    "skills/lfg/SKILL.md",
    "src/agents/harness.toml",
    "hooks/scripts/lfg-audit-hook.sh",
    "hooks/scripts/lfg-goal-harness.sh",
    "bin/lfg-mcp.py",
    "bin/grok-install-smoke.sh",
]:
    assert (root / rel).exists(), rel

assert not (repo / "Cargo.toml").exists(), "root Cargo.toml must be removed"
assert not (repo / "Cargo.lock").exists(), "root Cargo.lock must be removed"
assert not (repo / "src").exists(), "root src/ must be removed"
assert not (repo / "scripts").exists(), "root scripts/ must be removed"
assert (repo / "tests" / "smoke" / "test_grok_build_runtime.py").exists()
assert (repo / "tests" / "AGENTS.md").exists()
assert (root / "bin/grok-install-smoke.sh").stat().st_mode & 0o111, "bin/grok-install-smoke.sh executable"

hooks = json.loads((root / "hooks/hooks.json").read_text())["hooks"]
hook_commands = {
    h["command"]
    for entries in hooks.values()
    if isinstance(entries, list)
    for entry in entries
    for h in entry["hooks"]
}
assert "scripts/lfg-audit-hook.sh" in hook_commands, hook_commands
assert "scripts/lfg-goal-harness.sh" in hook_commands, hook_commands

workflow = (repo / ".github/workflows/smoke.yml").read_text()
assert "plugins/lfg/bin/self-test.sh" in workflow
assert "actions/checkout@v5" in workflow
assert "sudo apt-get install -y tmux" in workflow
assert "FORCE_JAVASCRIPT_ACTIONS_TO_NODE24" in workflow

release_notes = (repo / "docs/MARKETPLACE_RELEASE_NOTES.md").read_text()
assert "islee23520/lfg" in release_notes
assert "lfg 0.4.0" in release_notes
assert "/plugins" in release_notes
assert (repo / "docs/MARKETPLACE_INSTALL.md").exists()

for rel in [".grok/plugins/marketplace.json", ".agents/plugins/marketplace.json"]:
    data = json.loads((repo / rel).read_text())
    plugins = data.get("plugins", [])
    assert len(plugins) == 1, rel
    plugin = plugins[0]
    assert plugin["name"] == "lfg", rel
    assert plugin["source"]["path"] == "plugins/lfg", rel
    assert plugin["metadata"]["packageName"] == "islee23520/lfg", rel
    assert plugin["metadata"]["reference"] == "https://github.com/code-yeongyu/oh-my-openagent", rel

print("manifest-and-file-checks=ok")
print("marketplace-metadata=ok")
print("release-notes=ok")
print("marketplace-source=ok")
PY

printf '{"tool":"bash","args":"xai-SECRET ghp_SECRET"}' \
  | GROK_PLUGIN_ROOT="$ROOT" GROK_PLUGIN_DATA="$TMP" GROK_HOOK_EVENT=PreToolUse \
    "$ROOT/hooks/scripts/lfg-audit-hook.sh"
LOG="$TMP/events/audit.jsonl"
test -s "$LOG"
if grep -E 'xai-SECRET|ghp_SECRET' "$LOG" >/dev/null; then
  echo "redaction=failed" >&2
  exit 1
fi
echo "hook-smoke=ok log=$LOG"

HOOK_TMP="$TMP/hook-continuation"
mkdir -p "$HOOK_TMP/state" "$HOOK_TMP/ultragoal/ug-selftest"
printf '{"id":"ug-selftest","objective":"finish continuation fixture"}' >"$HOOK_TMP/state/current-ultragoal.json"
printf '{"ultragoal_id":"ug-selftest","next_actions":[{"id":"NA-1","goal":"Finish incomplete fixture","status":"in_progress"}],"recent_evidence":[{"ts":"2026-05-20T00:00:00Z","path":"evidence.txt"}]}' >"$HOOK_TMP/ultragoal/ug-selftest/boulder.json"
INCOMPLETE_OUTPUT="$(printf '{"prompt":"continue"}' | GROK_PLUGIN_ROOT="$ROOT" GROK_PLUGIN_DATA="$HOOK_TMP" GROK_HOOK_EVENT=PostToolUse "$ROOT/hooks/scripts/lfg-goal-harness.sh")"
SECOND_OUTPUT="$(printf '{"prompt":"continue"}' | GROK_PLUGIN_ROOT="$ROOT" GROK_PLUGIN_DATA="$HOOK_TMP" GROK_HOOK_EVENT=PostToolUse "$ROOT/hooks/scripts/lfg-goal-harness.sh")"
printf '{"ultragoal_id":"ug-selftest","next_actions":[{"id":"NA-1","goal":"Finish incomplete fixture","status":"completed"}],"recent_evidence":[{"ts":"2026-05-20T00:00:01Z","path":"evidence.txt"}]}' >"$HOOK_TMP/ultragoal/ug-selftest/boulder.json"
COMPLETED_OUTPUT="$(printf '{"prompt":"continue"}' | GROK_PLUGIN_ROOT="$ROOT" GROK_PLUGIN_DATA="$HOOK_TMP" GROK_HOOK_EVENT=PostToolUse "$ROOT/hooks/scripts/lfg-goal-harness.sh")"
case "$INCOMPLETE_OUTPUT" in *"[SYSTEM REMINDER - TODO CONTINUATION]"*) ;; *) echo "todo-continuation=missing" >&2; exit 1 ;; esac
case "$SECOND_OUTPUT" in *"[SYSTEM REMINDER - TODO CONTINUATION]"*) echo "todo-continuation=repeated-without-progress" >&2; exit 1 ;; esac
case "$COMPLETED_OUTPUT" in *"[SYSTEM REMINDER - TODO CONTINUATION]"*) echo "todo-continuation=completed-state" >&2; exit 1 ;; esac
echo "todo-continuation=ok"

python3 -m ruff check "$REPO"
echo "ruff-check=ok"

python3 - <<'PY' "$ROOT/bin/lfg-mcp.py"
import json, subprocess, sys
p = subprocess.Popen(["python3", sys.argv[1]], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
p.stdin.write(json.dumps({"jsonrpc":"2.0","id":1,"method":"initialize","params":{}})+"\n")
p.stdin.write(json.dumps({"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}})+"\n")
p.stdin.flush()
first=json.loads(p.stdout.readline())
second=json.loads(p.stdout.readline())
p.kill()
assert first["result"]["serverInfo"]["name"] == "lfg-harness"
names={t["name"] for t in second["result"]["tools"]}
assert "grok_build_catalog" in names
assert "grok_build_team" in names
assert "grok_build_slash" in names
print("mcp-smoke=ok")
print("mcp-stdio-isolation=ok")
print("mcp-stderr-isolated=ok")
PY

DOCTOR_JSON="$(GROK_PLUGIN_ROOT="$ROOT" GROK_PLUGIN_DATA="$TMP" "$ROOT/bin/lfg" --json doctor)"
DOCTOR_JSON="$DOCTOR_JSON" python3 - <<'PY'
import json, os
d=json.loads(os.environ["DOCTOR_JSON"])
checks={c["name"]: c for c in d["checks"]}
assert d["ok"], d
assert checks["state_schema"]["ok"], checks["state_schema"]
assert checks["catalog"]["ok"], checks["catalog"]
print("state-schema-versioning=ok")
print("state-schema-doctor=ok")
PY

TEAM_JSON="$(GROK_PLUGIN_ROOT="$ROOT" GROK_PLUGIN_DATA="$TMP" "$ROOT/bin/lfg" --json team create 3:executor "self-test dry run" --providers noop --dry-run)"
TEAM_JSON="$TEAM_JSON" python3 - <<'PY'
import json, os
d=json.loads(os.environ["TEAM_JSON"])
assert d["status"] == "planned"
providers = [m["provider"] for m in d["members"]]
assert providers == ["noop", "noop", "noop"], providers
PY
echo "team-dry-run=ok"

MODELS_JSON="$(GROK_PLUGIN_ROOT="$ROOT" GROK_PLUGIN_DATA="$TMP" "$ROOT/bin/lfg" --json models)"
AUTH_JSON="$(GROK_PLUGIN_ROOT="$ROOT" GROK_PLUGIN_DATA="$TMP" "$ROOT/bin/lfg" --json auth login xai --id xai-main --env XAI_API_KEY)"
MODELS_JSON="$MODELS_JSON" AUTH_JSON="$AUTH_JSON" python3 - <<'PY'
import json, os
models=json.loads(os.environ["MODELS_JSON"])
auth=json.loads(os.environ["AUTH_JSON"])
assert models["ok"], models
assert models["secretStorage"] == "env-name-only", models
assert auth["ok"], auth
assert auth["auth"]["secretStored"] is False, auth
print("models-auth=ok")
PY

TEAM_NAME="lfg-selftest-$$"
GROK_PLUGIN_ROOT="$ROOT" GROK_PLUGIN_DATA="$TMP" "$ROOT/bin/lfg" --json team create 1:executor "self-test lifecycle" --providers noop --name "$TEAM_NAME" >/tmp/lfg-selftest-team-create.json
GROK_PLUGIN_ROOT="$ROOT" GROK_PLUGIN_DATA="$TMP" "$ROOT/bin/lfg" --json team status "$TEAM_NAME" >/tmp/lfg-selftest-team-status.json
GROK_PLUGIN_ROOT="$ROOT" GROK_PLUGIN_DATA="$TMP" "$ROOT/bin/lfg" --json team resume "$TEAM_NAME" >/tmp/lfg-selftest-team-resume.json
GROK_PLUGIN_ROOT="$ROOT" GROK_PLUGIN_DATA="$TMP" "$ROOT/bin/lfg" --json team shutdown "$TEAM_NAME" >/tmp/lfg-selftest-team-shutdown.json
python3 - <<'PY'
import json, pathlib
create=json.loads(pathlib.Path('/tmp/lfg-selftest-team-create.json').read_text())
status=json.loads(pathlib.Path('/tmp/lfg-selftest-team-status.json').read_text())
resume=json.loads(pathlib.Path('/tmp/lfg-selftest-team-resume.json').read_text())
shutdown=json.loads(pathlib.Path('/tmp/lfg-selftest-team-shutdown.json').read_text())
assert create['status'] == 'running', create
assert status['tmux']['returncode'] == 0, status
assert 'attachCommand' in resume, resume
assert shutdown['status'] == 'shutdown', shutdown
print('team-tmux-lifecycle=ok')
PY

python3 -m unittest tests.smoke.test_grok_build_runtime -v
echo "runtime-smoke-coverage=100%"
