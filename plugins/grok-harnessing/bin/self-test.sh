#!/usr/bin/env bash
set -euo pipefail
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

python3 - "$ROOT" <<'PY'
import json, pathlib, sys
root = pathlib.Path(sys.argv[1])
for rel in [".grok-plugin/plugin.json", ".claude-plugin/plugin.json", "hooks/hooks.json", ".mcp.json", ".lsp.json", "catalog/omx-skill-map.json"]:
    json.loads((root / rel).read_text())
for rel in ["skills/grok-harnessing/SKILL.md", "agents/harness.toml", "hooks/scripts/grok-build-audit-hook.sh", "bin/grok-build-mcp.py", "bin/grok-install-smoke.sh"]:
    assert (root / rel).exists(), rel
assert (root / "bin/grok-install-smoke.sh").stat().st_mode & 0o111, "bin/grok-install-smoke.sh executable"
repo = root.parents[1]
workflow = (repo / ".github/workflows/smoke.yml").read_text()
assert "plugins/grok-harnessing/bin/self-test.sh" in workflow
assert "sudo apt-get install -y tmux" in workflow
smoke_doc = (repo / "docs/SMOKE.md").read_text()
for required in ["plugins/grok-harnessing/bin/self-test.sh", "plugins/grok-harnessing/bin/grok-install-smoke.sh", ".github/workflows/smoke.yml", "runtime-smoke-coverage=100%", "grok-install-smoke=ok skills=28"]:
    assert required in smoke_doc, required
install_smoke = (root / "bin/grok-install-smoke.sh").read_text()
assert "grok-install-smoke=ok skills=28" in install_smoke
assert "rsync -a --delete" in install_smoke
assert "inspect --json" in install_smoke
for rel in [".grok/plugins/marketplace.json", ".agents/plugins/marketplace.json"]:
    data = json.loads((repo / rel).read_text())
    plugins = data.get("plugins", [])
    assert len(plugins) == 1, rel
    plugin = plugins[0]
    assert plugin["name"] == "grok-build", rel
    assert plugin["source"]["path"] == "plugins/grok-harnessing", rel
    assert plugin["metadata"]["packageName"] == "linalab-io-framework/grok-build", rel
    assert plugin["metadata"]["reference"] == "https://github.com/Yeachan-Heo/oh-my-codex", rel
print("manifest-and-file-checks=ok")
print("marketplace-metadata=ok")
PY

printf '{"tool":"bash","args":"xai-SECRET ghp_SECRET"}' \
  | GROK_PLUGIN_ROOT="$ROOT" GROK_PLUGIN_DATA="$TMP" GROK_HOOK_EVENT=PreToolUse \
    "$ROOT/hooks/scripts/grok-build-audit-hook.sh"
LOG="$TMP/events/audit.jsonl"
test -s "$LOG"
if grep -E 'xai-SECRET|ghp_SECRET' "$LOG" >/dev/null; then
  echo "redaction=failed" >&2
  exit 1
fi
echo "hook-smoke=ok log=$LOG"

python3 - <<'PY' "$ROOT/bin/grok-build-mcp.py"
import json, subprocess, sys
p = subprocess.Popen(["python3", sys.argv[1]], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
p.stdin.write(json.dumps({"jsonrpc":"2.0","id":1,"method":"initialize","params":{}})+"\n")
p.stdin.write(json.dumps({"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}})+"\n")
p.stdin.flush()
first=json.loads(p.stdout.readline())
second=json.loads(p.stdout.readline())
p.kill()
assert first["result"]["serverInfo"]["name"] == "grok-build-harness"
names={t["name"] for t in second["result"]["tools"]}
assert "grok_build_catalog" in names
assert "grok_build_team" in names
assert "grok_build_slash" in names
print("mcp-smoke=ok")
PY

TEAM_JSON="$($ROOT/bin/lfg --json team create 3:executor "self-test dry run" --dry-run)"
TEAM_JSON="$TEAM_JSON" python3 - <<'PY'
import json, os
d=json.loads(os.environ["TEAM_JSON"])
assert d["status"] == "planned"
assert [m["provider"] for m in d["members"]] == ["hermes", "claude", "codex"]
PY
echo "team-dry-run=ok"

python3 -m unittest tests.smoke.test_grok_build_runtime -v
echo "runtime-smoke-coverage=100%"
