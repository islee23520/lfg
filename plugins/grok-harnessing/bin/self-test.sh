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
hooks = json.loads((root / "hooks/hooks.json").read_text())["hooks"]
hook_commands = {h["command"] for entries in hooks.values() for entry in entries for h in entry["hooks"]}
assert "scripts/grok-build-audit-hook.sh" in hook_commands, hook_commands
repo = root.parents[1]
install_lfg = (repo / "scripts/install-lfg-symlink.sh").read_text()
launch_lfg = (repo / "scripts/verify-lfg-launch.sh").read_text()
assert "lfg-launch-smoke=ok" in launch_lfg
assert "tmux has-session" in launch_lfg
assert (repo / "scripts/verify-lfg-launch.sh").stat().st_mode & 0o111, "scripts/verify-lfg-launch.sh executable"
plugins_surface = (repo / "scripts/verify-grok-plugins-surface.sh").read_text()
assert "grok-plugins-list=ok" in plugins_surface
assert "grok-plugins-surface=ok" in plugins_surface
assert (repo / "scripts/verify-grok-plugins-surface.sh").stat().st_mode & 0o111, "scripts/verify-grok-plugins-surface.sh executable"
release_tag = (repo / "scripts/verify-release-tag.sh").read_text()
assert "release-tag=ok" in release_tag
assert "release-tag-remote=ok" in release_tag
assert (repo / "docs/RELEASE_TAGS.md").exists(), "docs/RELEASE_TAGS.md"
assert (repo / "scripts/verify-release-tag.sh").stat().st_mode & 0o111, "scripts/verify-release-tag.sh executable"
hook_discovery = (repo / "scripts/verify-grok-hook-discovery.sh").read_text()
assert "grok-hook-discovery=ok" in hook_discovery
assert "hook-event-replay=ok" in hook_discovery
assert "grok-headless-session=ok" in hook_discovery
assert (repo / "docs/HOOK_EVIDENCE.md").exists(), "docs/HOOK_EVIDENCE.md"
assert (repo / "scripts/verify-grok-hook-discovery.sh").stat().st_mode & 0o111, "scripts/verify-grok-hook-discovery.sh executable"
limitation = (repo / "scripts/verify-grok-hook-headless-limitation.sh").read_text()
assert "grok-real-tool-session=ok" in limitation
assert "grok-headless-hook-emission=not-observed" in limitation
assert (repo / "scripts/verify-grok-hook-headless-limitation.sh").stat().st_mode & 0o111, "scripts/verify-grok-hook-headless-limitation.sh executable"
hooks_slash = (repo / "scripts/verify-grok-hooks-slash-limitation.sh").read_text()
assert "grok-hooks-list-headless=not-observed" in hooks_slash
assert (repo / "scripts/verify-grok-hooks-slash-limitation.sh").stat().st_mode & 0o111, "scripts/verify-grok-hooks-slash-limitation.sh executable"
tui_limitation = (repo / "scripts/verify-grok-tui-hook-limitation.sh").read_text()
assert "grok-tui-hook-session=attempted" in tui_limitation
assert "grok-tui-hook-emission=not-observed" in tui_limitation
assert (repo / "scripts/verify-grok-tui-hook-limitation.sh").stat().st_mode & 0o111, "scripts/verify-grok-tui-hook-limitation.sh executable"
bridge = (repo / "scripts/verify-grok-build-global-hook-bridge.sh").read_text()
assert "grok-global-hook-bridge=ok" in bridge
assert (repo / "scripts/install-grok-build-global-hook-bridge.sh").stat().st_mode & 0o111, "scripts/install-grok-build-global-hook-bridge.sh executable"
assert (repo / "scripts/verify-grok-build-global-hook-bridge.sh").stat().st_mode & 0o111, "scripts/verify-grok-build-global-hook-bridge.sh executable"
scope_limitation = (repo / "scripts/verify-grok-plugin-hook-scope-limitation.sh").read_text()
assert "grok-global-hook-engine=ok" in scope_limitation
assert "grok-plugin-hook-scope=not-observed" in scope_limitation
assert (repo / "scripts/verify-grok-plugin-hook-scope-limitation.sh").stat().st_mode & 0o111, "scripts/verify-grok-plugin-hook-scope-limitation.sh executable"
marketplace_source = (repo / "scripts/verify-marketplace-source.sh").read_text()
assert "marketplace-source=ok" in marketplace_source
assert "marketplace-remote-source=ok" in marketplace_source
assert (repo / "docs/MARKETPLACE_INSTALL.md").exists(), "docs/MARKETPLACE_INSTALL.md"
assert (repo / "scripts/verify-marketplace-source.sh").stat().st_mode & 0o111, "scripts/verify-marketplace-source.sh executable"
release_notes = (repo / "scripts/verify-release-notes.sh").read_text()
assert "release-notes=ok" in release_notes
assert (repo / "docs/MARKETPLACE_RELEASE_NOTES.md").exists(), "docs/MARKETPLACE_RELEASE_NOTES.md"
assert (repo / "scripts/verify-release-notes.sh").stat().st_mode & 0o111, "scripts/verify-release-notes.sh executable"
state_schema = (repo / "scripts/verify-state-schema.sh").read_text()
assert "state-schema-versioning=ok" in state_schema
assert "state-schema-doctor=ok" in state_schema
assert (repo / "scripts/verify-state-schema.sh").stat().st_mode & 0o111, "scripts/verify-state-schema.sh executable"
mcp_stdio = (repo / "scripts/verify-mcp-stdio-isolation.sh").read_text()
assert "mcp-stdio-isolation=ok" in mcp_stdio
assert "mcp-stderr-isolated=ok" in mcp_stdio
assert (repo / "scripts/verify-mcp-stdio-isolation.sh").stat().st_mode & 0o111, "scripts/verify-mcp-stdio-isolation.sh executable"
team_lifecycle = (repo / "scripts/verify-team-tmux-lifecycle.sh").read_text()
assert "team-tmux-lifecycle=ok" in team_lifecycle
assert "team create" in team_lifecycle and "team status" in team_lifecycle and "team resume" in team_lifecycle and "team shutdown" in team_lifecycle
assert (repo / "scripts/verify-team-tmux-lifecycle.sh").stat().st_mode & 0o111, "scripts/verify-team-tmux-lifecycle.sh executable"
assert "ln -sfn" in install_lfg
assert "grok-build.py" in install_lfg
assert "lfg-status=ok" in install_lfg
assert "lfg-doctor=ok" in install_lfg
assert (repo / "scripts/install-lfg-symlink.sh").stat().st_mode & 0o111, "scripts/install-lfg-symlink.sh executable"
workflow = (repo / ".github/workflows/smoke.yml").read_text()
assert "plugins/grok-harnessing/bin/self-test.sh" in workflow
assert "actions/checkout@v5" in workflow
assert "sudo apt-get install -y tmux" in workflow
assert "FORCE_JAVASCRIPT_ACTIONS_TO_NODE24" in workflow
smoke_doc = (repo / "docs/SMOKE.md").read_text()
for required in ["plugins/grok-harnessing/bin/self-test.sh", "scripts/install-lfg-symlink.sh", "scripts/verify-lfg-launch.sh", "scripts/verify-team-preflight.sh", "scripts/verify-team-provider-commands.sh", "scripts/verify-team-tmux-lifecycle.sh", "scripts/verify-mcp-stdio-isolation.sh", "scripts/verify-state-schema.sh", "scripts/verify-release-notes.sh", "scripts/verify-marketplace-source.sh", "scripts/verify-grok-hook-discovery.sh", "scripts/verify-grok-build-global-hook-bridge.sh", "scripts/verify-grok-installed-mcp-surface.sh", "scripts/verify-installed-lfg-symlink-surface.sh", "scripts/verify-lfg-inside-tmux-attach.sh", "scripts/verify-release-tag.sh", "scripts/verify-grok-plugins-surface.sh", "plugins/grok-harnessing/bin/grok-install-smoke.sh", ".github/workflows/smoke.yml", "scripts/verify-remote-smoke.sh p1", "runtime-smoke-coverage=100%", "lfg-status=ok version=0.3.0", "lfg-doctor=ok", "lfg-launch-smoke=ok", "team-preflight-cli=ok", "team-preflight-slash=ok", "team-preflight-mcp=ok", "team-provider-matrix=ok", "team-provider-slash=ok", "team-provider-commands=ok", "team-tmux-lifecycle=ok", "mcp-stdio-isolation=ok", "state-schema-versioning=ok", "release-notes=ok", "marketplace-source=ok", "grok-hook-discovery=ok", "hook-event-replay=ok", "grok-headless-session=ok", "grok-global-hook-bridge=ok", "grok-installed-mcp-surface=ok", "lfg-installed-symlink-surface=ok", "lfg-inside-tmux-attach=ok", "release-tag=ok", "grok-plugins-surface=ok", "grok-install-smoke=ok skills=28", "remote-smoke=ok"]:
    assert required in smoke_doc, required
roadmap = (repo / "ROADMAP.md").read_text()
assert "- [x] Add behavioral smoke tests per workflow." in roadmap
assert "- [x] MCP stderr isolation." in roadmap
assert "- [x] State migration/versioning." in roadmap
assert "- [x] Marketplace release notes." in roadmap
assert "- [x] Publish/host marketplace metadata" in roadmap
assert "- [x] Document exact marketplace source URL." in roadmap
assert "marketplace-source=ok" in roadmap
assert "- [x] Release tags." in roadmap
assert "- [x] Verify install from Grok UI/TUI marketplace flow." in roadmap
assert "- [x] Remove local-dev install from primary docs once marketplace flow is stable." in roadmap
assert "grok-plugins-surface=ok" in roadmap
assert "grok-plugin-hook-scope=not-observed" in roadmap
assert "grok-global-hook-bridge=ok" in roadmap
assert "release-tag=ok" in roadmap
assert "release-notes=ok" in roadmap
assert "state-schema-versioning=ok" in roadmap
assert "mcp-stdio-isolation=ok" in roadmap
assert "team-tmux-lifecycle=ok" in roadmap
release_doc = (repo / "docs/RELEASE_CHECKLIST.md").read_text()
for required in ["runtime-smoke-coverage=100%", "scripts/install-lfg-symlink.sh", "scripts/verify-lfg-launch.sh", "scripts/verify-team-tmux-lifecycle.sh", "lfg-status=ok version=0.3.0", "lfg-doctor=ok", "team-preflight-cli=ok", "team-preflight-slash=ok", "team-preflight-mcp=ok", "team-provider-matrix=ok", "team-provider-slash=ok", "team-provider-commands=ok", "team-tmux-lifecycle=ok", "mcp-stdio-isolation=ok", "state-schema-versioning=ok", "release-notes=ok", "marketplace-source=ok", "grok-hook-discovery=ok", "hook-event-replay=ok", "grok-headless-session=ok", "grok-global-hook-bridge=ok", "grok-installed-mcp-surface=ok", "lfg-installed-symlink-surface=ok", "lfg-inside-tmux-attach=ok", "release-tag=ok", "grok-plugins-surface=ok", "grok-install-smoke=ok skills=28 key_skills_present", "remote-smoke=ok", "roadmap=27/27", "feature_docs=27/27", "linalab-io-framework/grok-build", "grok_marketplace", "agents_marketplace"]:
    assert required in release_doc, required
remote_smoke = (repo / "scripts/verify-remote-smoke.sh").read_text()
assert "gh run list" in remote_smoke
assert "gh run view" in remote_smoke
assert "remote-smoke=ok" in remote_smoke
assert (repo / "scripts/verify-remote-smoke.sh").stat().st_mode & 0o111, "scripts/verify-remote-smoke.sh executable"
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

"$ROOT/../../scripts/verify-mcp-stdio-isolation.sh"
"$ROOT/../../scripts/verify-state-schema.sh"
"$ROOT/../../scripts/verify-release-notes.sh"
"$ROOT/../../scripts/verify-marketplace-source.sh"

TEAM_JSON="$($ROOT/bin/lfg --json team create 3:executor "self-test dry run" --dry-run)"
TEAM_JSON="$TEAM_JSON" python3 - <<'PY'
import json, os
d=json.loads(os.environ["TEAM_JSON"])
assert d["status"] == "planned"
assert [m["provider"] for m in d["members"]] == ["hermes", "claude", "codex"]
PY
echo "team-dry-run=ok"

"$ROOT/../../scripts/verify-team-tmux-lifecycle.sh"

python3 -m unittest tests.smoke.test_grok_build_runtime -v
echo "runtime-smoke-coverage=100%"
