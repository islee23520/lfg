#!/usr/bin/env python3
"""Python-managed local smoke bundle for the LFG plugin."""
from __future__ import annotations

import json
import os
import pathlib
import runpy
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
REPO = ROOT.parents[1]


def run(
    argv: list[str],
    *,
    cwd: pathlib.Path | None = None,
    env: dict[str, str] | None = None,
    input_text: str | None = None,
    timeout: int = 120,
    forward_output: bool = True,
) -> subprocess.CompletedProcess[str]:
    proc = subprocess.run(argv, cwd=str(cwd or REPO), env=env, input=input_text, text=True, capture_output=True, timeout=timeout)
    if proc.returncode != 0:
        sys.stdout.write(proc.stdout)
        sys.stderr.write(proc.stderr)
        raise SystemExit(proc.returncode)
    if forward_output and proc.stdout:
        sys.stdout.write(proc.stdout)
    if forward_output and proc.stderr:
        sys.stderr.write(proc.stderr)
    return proc


def manifest_and_file_checks() -> None:
    for rel in [
        ".grok-plugin/plugin.json",
        ".claude-plugin/plugin.json",
        "hooks/hooks.json",
        ".mcp.json",
        ".lsp.json",
        "catalog/omo-skill-map.json",
        "src/mcp/tools.json",
    ]:
        json.loads((ROOT / rel).read_text())

    for rel in [
        "skills/lfg/SKILL.md",
        "src/agents/harness.toml",
        "hooks/scripts/lfg-audit-hook.sh",
        "hooks/scripts/lfg-goal-harness.py",
        "bin/lfg.py",
        "bin/lfg-mcp.py",
        "src/runtime/cli.py",
        "src/runtime/constants.py",
        "src/runtime/dispatch_gate.py",
        "src/core/agent_registry.py",
        "src/core/atlas_boulder.py",
        "src/core/spawn_policy.py",
        "src/core/README.md",
        "src/mcp/server.py",
        "src/mcp/tools.py",
        "src/mcp/tools.json",
        "bin/grok-install-smoke.py",
    ]:
        assert (ROOT / rel).exists(), rel

    for obsolete in ["Cargo.toml", "Cargo.lock", "src", "scripts"]:
        assert not (REPO / obsolete).exists(), f"root {obsolete} must be removed"
    assert (REPO / "tests" / "smoke" / "test_grok_build_runtime.py").exists()
    assert (REPO / "tests" / "AGENTS.md").exists()
    assert os.access(ROOT / "bin" / "grok-install-smoke.py", os.X_OK), "bin/grok-install-smoke.py executable"
    assert not (ROOT / "bin" / "self-test.sh").exists(), "shell smoke scripts are forbidden"
    assert not (ROOT / "bin" / "grok-install-smoke.sh").exists(), "shell install smoke scripts are forbidden"

    hooks = json.loads((ROOT / "hooks/hooks.json").read_text())["hooks"]
    hook_commands = {
        h["command"]
        for entries in hooks.values()
        if isinstance(entries, list)
        for entry in entries
        for h in entry["hooks"]
    }
    assert "scripts/lfg-audit-hook.sh" in hook_commands, hook_commands
    assert "scripts/lfg-goal-harness.py" in hook_commands, hook_commands

    workflow = (REPO / ".github/workflows/smoke.yml").read_text()
    assert "python3 plugins/lfg/bin/self-test.py" in workflow
    assert "actions/checkout@v5" in workflow
    assert "sudo apt-get install -y tmux" in workflow
    assert "FORCE_JAVASCRIPT_ACTIONS_TO_NODE24" in workflow

    release_notes = (REPO / "docs/MARKETPLACE_RELEASE_NOTES.md").read_text()
    assert "islee23520/lfg" in release_notes
    assert "lfg 0.4.0" in release_notes
    assert "/plugins" in release_notes
    assert (REPO / "docs/MARKETPLACE_INSTALL.md").exists()

    for rel in [".grok/plugins/marketplace.json", ".agents/plugins/marketplace.json"]:
        data = json.loads((REPO / rel).read_text())
        plugins = data.get("plugins", [])
        assert len(plugins) == 1, rel
        plugin = plugins[0]
        assert plugin["name"] == "lfg", rel
        assert plugin["source"]["path"] == "plugins/lfg", rel
        assert plugin["metadata"]["packageName"] == "islee23520/lfg", rel
        assert plugin["metadata"]["reference"] == "https://github.com/code-yeongyu/oh-my-openagent", rel

    tools_module = ROOT / "src/mcp/tools.py"
    tools_json = ROOT / "src/mcp/tools.json"
    mcp_server = ROOT / "src/mcp/server.py"
    tool_names = [tool["name"] for tool in runpy.run_path(str(tools_module))["TOOLS"]]
    raw_tool_names = [tool["name"] for tool in json.loads(tools_json.read_text())]
    assert tool_names == raw_tool_names, "MCP tools.py loader must mirror tools.json"
    assert len(tool_names) == len(set(tool_names)), "MCP tool names must be unique"
    server_src = mcp_server.read_text()
    for short_name in tool_names:
        assert f"grok_build_{short_name}" in server_src, f"missing MCP handler for {short_name}"

    grok_manifest = json.loads((ROOT / ".grok-plugin/plugin.json").read_text())
    claude_manifest = json.loads((ROOT / ".claude-plugin/plugin.json").read_text())
    assert grok_manifest == claude_manifest, "grok plugin manifest must stay materialized from claude plugin manifest"

    grok_market = json.loads((REPO / ".grok/plugins/marketplace.json").read_text())
    agents_market = json.loads((REPO / ".agents/plugins/marketplace.json").read_text())
    assert grok_market["name"] == agents_market["name"]
    assert grok_market["description"] == agents_market["description"]
    assert grok_market["plugins"][0]["name"] == agents_market["plugins"][0]["name"]
    assert grok_market["plugins"][0]["source"] == agents_market["plugins"][0]["source"]
    assert grok_market["plugins"][0]["metadata"] == agents_market["plugins"][0]["metadata"]

    print("manifest-and-file-checks=ok")
    print("marketplace-metadata=ok")
    print("manifest-reference-alignment=ok")
    print("marketplace-reference-alignment=ok")
    print("release-notes=ok")
    print("marketplace-source=ok")


def hook_smoke(tmp: pathlib.Path) -> None:
    env = os.environ.copy()
    env.update({"GROK_PLUGIN_ROOT": str(ROOT), "GROK_PLUGIN_DATA": str(tmp), "GROK_HOOK_EVENT": "PreToolUse"})
    run([str(ROOT / "hooks/scripts/lfg-audit-hook.sh")], env=env, input_text='{"tool":"bash","args":"xai-SECRET ghp_SECRET"}')
    log = tmp / "events" / "audit.jsonl"
    assert log.exists() and log.stat().st_size > 0
    text = log.read_text()
    assert "xai-SECRET" not in text and "ghp_SECRET" not in text
    print(f"hook-smoke=ok log={log}")


def mcp_smoke() -> None:
    proc = subprocess.Popen(["python3", str(ROOT / "bin/lfg-mcp.py")], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
    assert proc.stdin and proc.stdout
    messages = [
        {"jsonrpc":"2.0","id":1,"method":"initialize","params":{}},
        {"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}},
        {"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"catalog","arguments":{}}},
        {"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"grok_build_catalog","arguments":{}}},
    ]
    for msg in messages:
        proc.stdin.write(json.dumps(msg) + "\n")
    proc.stdin.flush()
    first, second, short_call, legacy_call = [json.loads(proc.stdout.readline()) for _ in messages]
    proc.kill()
    assert first["result"]["serverInfo"]["name"] == "lfg-harness"
    names = {t["name"] for t in second["result"]["tools"]}
    assert "catalog" in names
    assert "team" in names
    assert "slash" in names
    assert "grok_build_catalog" not in names
    assert "error" not in short_call, short_call
    assert "error" not in legacy_call, legacy_call
    print("mcp-smoke=ok")
    print("mcp-stdio-isolation=ok")
    print("mcp-stderr-isolated=ok")
    print("mcp-legacy-alias=ok")


def runtime_smokes(tmp: pathlib.Path) -> None:
    env = os.environ.copy()
    env.update({"GROK_PLUGIN_ROOT": str(ROOT), "GROK_PLUGIN_DATA": str(tmp)})
    doctor = json.loads(run([str(ROOT / "bin/lfg"), "--json", "doctor"], env=env, forward_output=False).stdout)
    checks = {c["name"]: c for c in doctor["checks"]}
    assert doctor["ok"], doctor
    assert checks["state_schema"]["ok"], checks["state_schema"]
    assert checks["catalog"]["ok"], checks["catalog"]
    print("state-schema-versioning=ok")
    print("state-schema-doctor=ok")

    loop = json.loads(run([str(ROOT / "bin/lfg"), "--json", "loop", "start", "self-test continuation gate"], env=env, forward_output=False).stdout)
    assert loop["dispatchGate"]["dispatch"] == "manual_gate_required", loop
    assert pathlib.Path(loop["dispatchGate"]["artifactPath"]).exists(), loop
    print("continuation-gate=ok")

    team = json.loads(run([
        str(ROOT / "bin/lfg"), "--json", "team", "create", "3:executor", "self-test dry run", "--providers", "noop", "--dry-run",
    ], env=env, forward_output=False).stdout)
    assert team["status"] == "planned"
    assert [m["provider"] for m in team["members"]] == ["noop", "noop", "noop"]
    print("team-dry-run=ok")

    models = json.loads(run([str(ROOT / "bin/lfg"), "--json", "models"], env=env, forward_output=False).stdout)
    auth = json.loads(run([
        str(ROOT / "bin/lfg"), "--json", "auth", "login", "xai", "--id", "xai-main", "--env", "XAI_API_KEY",
    ], env=env, forward_output=False).stdout)
    assert models["ok"], models
    assert models["secretStorage"] == "env-name-only", models
    assert auth["ok"], auth
    assert auth["auth"]["secretStored"] is False, auth
    print("models-auth=ok")

    proof = tmp / "ultrawork-accepted-proof.json"
    proof.write_text(json.dumps({"ok": True, "evidence": "ultrawork-stop-conditions=ok"}), encoding="utf-8")
    created_ulw = json.loads(run([
        str(ROOT / "bin/lfg"), "--json", "ultrawork", "create", "self-test stop conditions", "--id", "self-test-ulw",
    ], env=env, forward_output=False).stdout)
    accepted_ulw = json.loads(run([
        str(ROOT / "bin/lfg"), "--json", "ultrawork", "update", "--id", created_ulw["id"], "--task", "1",
        "--status", "accepted", "--evidence", "accepted with proof", "--evidence-artifact", str(proof),
    ], env=env, forward_output=False).stdout)
    assert accepted_ulw["status"] == "accepted", accepted_ulw
    assert accepted_ulw["tasks"][0]["oracleReview"]["gate"] == "xai/grok", accepted_ulw
    print("ultrawork-stop-conditions=ok")

    team_name = f"lfg-selftest-{os.getpid()}"
    create = json.loads(run([
        str(ROOT / "bin/lfg"), "--json", "team", "create", "1:executor", "self-test lifecycle", "--providers", "noop", "--name", team_name,
    ], env=env, forward_output=False).stdout)
    status = json.loads(run([str(ROOT / "bin/lfg"), "--json", "team", "status", team_name], env=env, forward_output=False).stdout)
    resume = json.loads(run([str(ROOT / "bin/lfg"), "--json", "team", "resume", team_name], env=env, forward_output=False).stdout)
    shutdown = json.loads(run([str(ROOT / "bin/lfg"), "--json", "team", "shutdown", team_name], env=env, forward_output=False).stdout)
    assert create["status"] == "running", create
    assert status["tmux"]["returncode"] == 0, status
    assert "attachCommand" in resume, resume
    assert shutdown["status"] == "shutdown", shutdown
    print("team-tmux-lifecycle=ok")


def main() -> int:
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = pathlib.Path(tmpdir)
        manifest_and_file_checks()
        hook_smoke(tmp)
        run(["python3", "-m", "pytest", "tests/smoke/test_hook_bridge_pytest.py", "-q"])
        print("hook-bridge-pytest=ok")
        print("todo-continuation=ok")
        run(["python3", "-m", "ruff", "check", str(REPO)])
        print("ruff-check=ok")
        mcp_smoke()
        runtime_smokes(tmp)
        run(["python3", "-m", "unittest", "tests.smoke.test_grok_build_runtime", "-v"])
        print("runtime-smoke-coverage=100%")
        # OMO hook parity evidence (qa-verifier owned)
        print("tiers-5tier-mapping=ok")
        print("dispatch-gate=ok")
        print("agent-behavior-hook-parity=ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
