from __future__ import annotations

import json
import os
import pathlib
import subprocess
import sys


REPO = pathlib.Path(__file__).resolve().parents[2]
PLUGIN = REPO / "plugins" / "lfg"


def run(command: list[str], *, env: dict[str, str] | None = None, input_text: str | None = None) -> subprocess.CompletedProcess[str]:
    merged_env = os.environ.copy()
    if env:
        merged_env.update(env)
    return subprocess.run(command, input=input_text, text=True, capture_output=True, env=merged_env, cwd=REPO, check=False)


def write_json(path: pathlib.Path, payload: object) -> None:
    path.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")


def test_plugin_hook_registration_uses_python_goal_harness() -> None:
    hooks = json.loads((PLUGIN / "hooks" / "hooks.json").read_text(encoding="utf-8"))["hooks"]
    commands = {
        hook["command"]
        for entries in hooks.values()
        if isinstance(entries, list)
        for entry in entries
        for hook in entry["hooks"]
    }
    assert "scripts/lfg-goal-harness.py" in commands
    assert "scripts/lfg-goal-harness.sh" not in commands


def test_global_hook_bridge_installer_writes_python_commands(tmp_path: pathlib.Path) -> None:
    home = tmp_path / "home"
    env = {"HOME": str(home), "LFG_PLUGIN_ROOT": str(PLUGIN)}
    result = run([sys.executable, str(PLUGIN / "scripts" / "hook-bridge-install.py")], env=env)
    assert result.returncode == 0, result.stderr
    assert "lfg-global-hook-bridge=installed-with-python-harness" in result.stdout

    hook_dir = home / ".grok" / "hooks"
    bridge = hook_dir / "lfg-audit-bridge.py"
    config = hook_dir / "lfg-audit-bridge.json"
    assert bridge.exists()
    assert os.access(bridge, os.X_OK)
    payload = json.loads(config.read_text(encoding="utf-8"))
    serialized = json.dumps(payload)
    assert "lfg-audit-bridge.py" in serialized
    assert "goal_harness.py" in serialized
    assert "lfg-audit-bridge.sh" not in serialized
    assert "lfg-goal-harness.sh" not in serialized


def test_lfg_hook_bridge_install_status_uses_python_bridge(tmp_path: pathlib.Path) -> None:
    home = tmp_path / "home"
    env = {"HOME": str(home), "GROK_PLUGIN_DATA": str(tmp_path / "data")}
    install = run([str(PLUGIN / "bin" / "lfg"), "--json", "hook-bridge", "install"], env=env)
    assert install.returncode == 0, install.stderr
    installed = json.loads(install.stdout)
    assert installed["ok"] is True
    assert installed["valid"] is True
    assert installed["script"].endswith("lfg-audit-bridge.py")
    assert installed["harness"].endswith("goal_harness.py")

    status = run([str(PLUGIN / "bin" / "lfg"), "--json", "hook-bridge", "status"], env=env)
    assert status.returncode == 0, status.stderr
    current = json.loads(status.stdout)
    assert current["ok"] is True
    assert current["valid"] is True

    config_text = (home / ".grok" / "hooks" / "lfg-audit-bridge.json").read_text(encoding="utf-8")
    assert "goal_harness.py" in config_text
    assert "lfg-goal-harness.sh" not in config_text


def test_goal_harness_python_entrypoint_preserves_todo_continuation(tmp_path: pathlib.Path) -> None:
    state = tmp_path / "state"
    boulder_dir = tmp_path / "ultragoal" / "ug-selftest"
    state.mkdir(parents=True)
    boulder_dir.mkdir(parents=True)
    write_json(state / "current-ultragoal.json", {"id": "ug-selftest", "objective": "finish continuation fixture"})
    write_json(
        boulder_dir / "boulder.json",
        {
            "ultragoal_id": "ug-selftest",
            "next_actions": [{"id": "NA-1", "goal": "Finish incomplete fixture", "status": "in_progress"}],
            "recent_evidence": [{"ts": "2026-05-20T00:00:00Z", "path": "evidence.txt"}],
        },
    )
    env = {"GROK_PLUGIN_ROOT": str(PLUGIN), "GROK_PLUGIN_DATA": str(tmp_path), "GROK_HOOK_EVENT": "PostToolUse"}
    first = run([sys.executable, str(PLUGIN / "hooks" / "scripts" / "lfg-goal-harness.py")], env=env, input_text='{"prompt":"continue"}')
    second = run([sys.executable, str(PLUGIN / "hooks" / "scripts" / "lfg-goal-harness.py")], env=env, input_text='{"prompt":"continue"}')
    assert first.returncode == 0
    assert second.returncode == 0
    assert "[SYSTEM REMINDER - TODO CONTINUATION]" in first.stdout
    assert "[SYSTEM REMINDER - TODO CONTINUATION]" not in second.stdout
    dispatch_artifacts = sorted((tmp_path / "dispatch-gate").glob("*.json"))
    assert len(dispatch_artifacts) == 1
    dispatch = json.loads(dispatch_artifacts[0].read_text(encoding="utf-8"))
    assert dispatch["dispatch"] == "manual_gate_required"
    assert dispatch["stateSnapshot"]["ultragoalId"] == "ug-selftest"
    assert dispatch["stateSnapshot"]["todoContinuationReminder"] is True
    assert dispatch["evidence"] == ["continuation-gate=ok"]

    write_json(
        boulder_dir / "boulder.json",
        {
            "ultragoal_id": "ug-selftest",
            "next_actions": [{"id": "NA-1", "goal": "Finish incomplete fixture", "status": "completed"}],
            "recent_evidence": [{"ts": "2026-05-20T00:00:01Z", "path": "evidence.txt"}],
        },
    )
    completed = run([sys.executable, str(PLUGIN / "hooks" / "scripts" / "lfg-goal-harness.py")], env=env, input_text='{"prompt":"continue"}')
    assert completed.returncode == 0
    assert "[SYSTEM REMINDER - TODO CONTINUATION]" not in completed.stdout
